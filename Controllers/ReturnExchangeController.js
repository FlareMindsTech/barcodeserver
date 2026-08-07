/**
 * @file ReturnExchangeController.js
 * @description Controller for Return, Exchange, and Refund Management operations.
 *
 * SCHEMA CHANGE REQUIRED (not included in this file, apply separately):
 *   Refund.js -> add a `direction` field:
 *     direction: {
 *       type: String,
 *       enum: ['to_customer', 'from_customer'],
 *       default: 'to_customer'
 *     }
 *   This lets one model represent both "we refunded the customer" (plain returns,
 *   and exchanges where the new item is cheaper) and "customer paid us extra"
 *   (exchanges where the new item is more expensive) without a payment gateway --
 *   it's just a ledger entry for money that already changed hands at the counter.
 */

import mongoose from 'mongoose';
import Return from '../Models/Return.js';
import Refund from '../Models/Refund.js';
import Invoice from '../Models/Invoice.js';
import Bill from '../Models/Bill.js';
import BillItem from '../Models/BillItem.js';
import Product from '../Models/Product.js';
import RetailInventory from '../Models/RetailInventory.js';
import RetailStockMovement from '../Models/RetailStockMovement.js';

const ALLOWED_SETTLEMENT_METHODS = ['cash', 'card', 'upi', 'store_credit'];

/**
 * Helper to resolve product reference by ID, Code, or Barcode
 */
const findProduct = async (productRef, session) => {
  const query = mongoose.Types.ObjectId.isValid(productRef)
    ? { $or: [{ _id: productRef }, { productId: productRef }, { barcode: productRef }] }
    : { $or: [{ productId: productRef }, { barcode: productRef }] };
  return await Product.findOne(query).session(session || null);
};

const isPositiveInteger = (val) => Number.isInteger(val) && val > 0;

/**
 * 1. Return Product
 * Endpoint: POST /api/returns
 */
export const returnProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { invoiceNumber, productId, quantity, reason } = req.body;
    const userId = req.user.userId;

    if (!invoiceNumber || !productId || quantity === undefined) {
      return res.status(400).json({
        Success: false,
        Message: 'invoiceNumber, productId, and quantity are required.',
        Result: null,
        StatusCode: 400
      });
    }

    if (!isPositiveInteger(quantity)) {
      return res.status(400).json({
        Success: false,
        Message: 'quantity must be a positive integer.',
        Result: null,
        StatusCode: 400
      });
    }

    let resultPayload;

    await session.withTransaction(async () => {
      // 1. Verify Invoice
      const invoice = await Invoice.findOne({ invoiceNumber }).populate('billId').session(session);
      if (!invoice) {
        throw { statusCode: 404, message: `Invoice ${invoiceNumber} not found.` };
      }

      if (invoice.invoiceStatus === 'cancelled') {
        throw { statusCode: 400, message: 'Cannot return products from a cancelled invoice.' };
      }

      // 2. Verify Product
      const product = await findProduct(productId, session);
      if (!product) {
        throw { statusCode: 404, message: `Product ${productId} not found.` };
      }

      // 3. Find Product in Invoice (via BillItem)
      const billItem = await BillItem.findOne({
        billId: invoice.billId._id,
        productId: product._id
      }).session(session);
      if (!billItem) {
        throw { statusCode: 400, message: 'This product was not purchased in the specified invoice.' };
      }

      // 4. Validate quantity limits (safe inside transaction: no concurrent writer can
      // insert a competing Return between this read and our write below)
      const existingReturns = await Return.find({
        invoiceId: invoice._id,
        productId: product._id,
        status: { $in: ['approved', 'refunded', 'exchanged'] }
      }).session(session);
      const totalAlreadyReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);

      if (totalAlreadyReturned + quantity > billItem.quantity) {
        throw {
          statusCode: 400,
          message: `Maximum return quantity exceeded. Already returned: ${totalAlreadyReturned}, Purchased: ${billItem.quantity}, Requested: ${quantity}.`
        };
      }

      // 5. Calculate Refund Amount (GST and discounts considered per unit)
      const unitPrice = billItem.total / billItem.quantity;
      const refundAmount = unitPrice * quantity;

      // 6. Save Return record
      const newReturn = new Return({
        invoiceId: invoice._id,
        productId: product._id,
        quantity,
        refundAmount: parseFloat(refundAmount.toFixed(2)),
        returnReason: reason || 'Size / Quality Issue',
        status: 'approved', // Auto-approved on request creation
        approvedBy: userId
      });
      await newReturn.save({ session });

      // 7. Restore Retail Stock and log movement
      await RetailInventory.adjustStock(product._id, quantity, { session });
      const movement = new RetailStockMovement({
        productId: product._id,
        movementType: 'return',
        quantity,
        remarks: `Restored stock from returned invoice ${invoiceNumber}`
      });
      await movement.save({ session });

      resultPayload = {
        returnId: newReturn._id.toString(),
        refundAmount: newReturn.refundAmount,
        status: 'Approved'
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Product returned successfully.',
      Result: resultPayload,
      StatusCode: 200
    });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({
        Success: false,
        Message: error.message,
        Result: null,
        StatusCode: error.statusCode
      });
    }
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * 2. Exchange Product
 * Endpoint: POST /api/exchanges
 *
 * Body may optionally include `settlementMethod` (cash/card/upi/store_credit).
 * Required whenever the exchange isn't an even swap, since real money changes
 * hands at the counter and we want a ledger entry for it (till reconciliation,
 * reporting, audit trail) even though there's no payment gateway involved.
 */
export const exchangeProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { invoiceNumber, oldProductId, newProductId, quantity, settlementMethod } = req.body;
    const userId = req.user.userId;

    if (!invoiceNumber || !oldProductId || !newProductId || quantity === undefined) {
      return res.status(400).json({
        Success: false,
        Message: 'invoiceNumber, oldProductId, newProductId, and quantity are required.',
        Result: null,
        StatusCode: 400
      });
    }

    if (!isPositiveInteger(quantity)) {
      return res.status(400).json({
        Success: false,
        Message: 'quantity must be a positive integer.',
        Result: null,
        StatusCode: 400
      });
    }

    if (oldProductId === newProductId) {
      return res.status(400).json({
        Success: false,
        Message: 'oldProductId and newProductId must be different products.',
        Result: null,
        StatusCode: 400
      });
    }

    if (settlementMethod !== undefined) {
      if (typeof settlementMethod !== 'string' || !ALLOWED_SETTLEMENT_METHODS.includes(settlementMethod.toLowerCase())) {
        return res.status(400).json({
          Success: false,
          Message: `Invalid settlementMethod. Allowed values: ${ALLOWED_SETTLEMENT_METHODS.join(', ')}`,
          Result: null,
          StatusCode: 400
        });
      }
    }

    let resultPayload;

    await session.withTransaction(async () => {
      // 1. Verify Invoice
      const invoice = await Invoice.findOne({ invoiceNumber }).populate('billId').session(session);
      if (!invoice) {
        throw { statusCode: 404, message: `Invoice ${invoiceNumber} not found.` };
      }

      if (invoice.invoiceStatus === 'cancelled') {
        throw { statusCode: 400, message: 'Cannot exchange products from a cancelled invoice.' };
      }

      // 2. Verify Old Product
      const oldProduct = await findProduct(oldProductId, session);
      if (!oldProduct) {
        throw { statusCode: 404, message: `Old Product ${oldProductId} not found.` };
      }

      // 3. Verify New Product
      const newProduct = await findProduct(newProductId, session);
      if (!newProduct) {
        throw { statusCode: 404, message: `New Product ${newProductId} not found.` };
      }

      // 4. Verify Original Purchase
      const oldBillItem = await BillItem.findOne({
        billId: invoice.billId._id,
        productId: oldProduct._id
      }).session(session);
      if (!oldBillItem) {
        throw { statusCode: 400, message: 'The old product was not purchased in the specified invoice.' };
      }

      // Validate return quantity of old product
      const existingReturns = await Return.find({
        invoiceId: invoice._id,
        productId: oldProduct._id,
        status: { $in: ['approved', 'refunded', 'exchanged'] }
      }).session(session);
      const totalAlreadyReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);

      if (totalAlreadyReturned + quantity > oldBillItem.quantity) {
        throw {
          statusCode: 400,
          message: `Maximum exchange/return quantity exceeded. Already returned/exchanged: ${totalAlreadyReturned}, Purchased: ${oldBillItem.quantity}, Requested: ${quantity}.`
        };
      }

      // 5. Calculate Price Difference
      const oldUnitRefund = oldBillItem.total / oldBillItem.quantity;
      const totalOldVal = oldUnitRefund * quantity;

      const newUnitGst = newProduct.mrp * (newProduct.gst / 100);
      const newUnitDisc = newProduct.mrp * (newProduct.discount / 100);
      const newUnitTotal = newProduct.mrp + newUnitGst - newUnitDisc;
      const totalNewVal = newUnitTotal * quantity;

      const priceDifference = totalNewVal - totalOldVal;
      const formattedDiff = parseFloat(priceDifference.toFixed(2));

      if (formattedDiff !== 0 && !settlementMethod) {
        throw {
          statusCode: 400,
          message: `This exchange has a price difference of ${Math.abs(formattedDiff)}. settlementMethod is required to record how it was settled at the counter.`
        };
      }

      // 6. Atomically deduct new-product stock, guarded so it can never go negative
      // even under concurrent requests (this replaces the earlier read-then-write check).
      const deducted = await RetailInventory.findOneAndUpdate(
        { productId: newProduct._id, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { session, new: true }
      );
      if (!deducted) {
        const currentInventory = await RetailInventory.findOne({ productId: newProduct._id }).session(session);
        throw {
          statusCode: 400,
          message: `Insufficient stock for the exchange product: ${newProduct.productName}. Available: ${currentInventory ? currentInventory.quantity : 0}.`
        };
      }
      const deductMovement = new RetailStockMovement({
        productId: newProduct._id,
        movementType: 'sale',
        quantity,
        remarks: `Deducted stock for exchange delivery on invoice ${invoiceNumber}`
      });
      await deductMovement.save({ session });

      // 7. Restore old product stock
      await RetailInventory.adjustStock(oldProduct._id, quantity, { session });
      const restoreMovement = new RetailStockMovement({
        productId: oldProduct._id,
        movementType: 'return',
        quantity,
        remarks: `Restored stock from exchange return on invoice ${invoiceNumber}`
      });
      await restoreMovement.save({ session });

      // 8. Save Exchange Return history
      const exchangeReturn = new Return({
        invoiceId: invoice._id,
        productId: oldProduct._id,
        quantity,
        refundAmount: 0, // Since it's swapped for a product, not cash-refunded directly
        returnReason: `Exchanged for ${newProduct.productName}`,
        status: 'exchanged',
        approvedBy: userId
      });
      await exchangeReturn.save({ session });

      // 9. Log the counter settlement (if any money changed hands) as a Refund
      // ledger entry, tied back to this Return, so it shows up in reconciliation
      // and audit trail even though no payment gateway was involved.
      let settlementRecord = null;
      if (formattedDiff !== 0) {
        const refund = new Refund({
          returnId: exchangeReturn._id,
          refundMethod: settlementMethod.toLowerCase(),
          amount: Math.abs(formattedDiff),
          direction: formattedDiff < 0 ? 'to_customer' : 'from_customer', // requires schema addition, see file header
          status: 'completed',
          processedAt: new Date()
        });
        await refund.save({ session });
        settlementRecord = refund;
      }

      let action = 'Even Exchange';
      if (formattedDiff > 0) {
        action = 'Customer Pays';
      } else if (formattedDiff < 0) {
        action = 'Refund Customer';
      }

      resultPayload = {
        priceDifference: formattedDiff,
        action,
        amount: Math.abs(formattedDiff),
        settlementMethod: settlementRecord ? settlementRecord.refundMethod : null,
        settlementId: settlementRecord ? settlementRecord._id.toString() : null,
        returnId: exchangeReturn._id.toString()
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Product exchanged successfully.',
      Result: resultPayload,
      StatusCode: 200
    });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({
        Success: false,
        Message: error.message,
        Result: null,
        StatusCode: error.statusCode
      });
    }
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * 3. Process Refund
 * Endpoint: POST /api/refunds
 */
export const processRefund = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { returnId, refundMethod } = req.body;

    if (!returnId || !refundMethod) {
      return res.status(400).json({
        Success: false,
        Message: 'returnId and refundMethod are required.',
        Result: null,
        StatusCode: 400
      });
    }

    if (typeof refundMethod !== 'string' || !ALLOWED_SETTLEMENT_METHODS.includes(refundMethod.toLowerCase())) {
      return res.status(400).json({
        Success: false,
        Message: `Invalid refund method. Allowed values: ${ALLOWED_SETTLEMENT_METHODS.join(', ')}`,
        Result: null,
        StatusCode: 400
      });
    }

    let resultPayload;

    await session.withTransaction(async () => {
      const returnDoc = await Return.findById(returnId).session(session);
      if (!returnDoc) {
        throw { statusCode: 404, message: 'Return record not found.' };
      }

      // Only a Return that's sitting in 'approved' state is eligible to be paid out.
      // This blocks 'refunded' (already done), 'rejected' (never eligible), and
      // 'exchanged' (settled separately via exchangeProduct, refundAmount is 0 there).
      if (returnDoc.status !== 'approved') {
        throw {
          statusCode: 400,
          message: `Cannot process refund for a return with status '${returnDoc.status}'.`
        };
      }

      const refund = new Refund({
        returnId: returnDoc._id,
        refundMethod: refundMethod.toLowerCase(),
        amount: returnDoc.refundAmount,
        direction: 'to_customer',
        status: 'completed',
        processedAt: new Date()
      });
      await refund.save({ session });

      returnDoc.status = 'refunded';
      await returnDoc.save({ session });

      resultPayload = {
        refundId: refund._id.toString(),
        amount: refund.amount,
        status: 'completed'
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Refund processed successfully.',
      Result: resultPayload,
      StatusCode: 200
    });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({
        Success: false,
        Message: error.message,
        Result: null,
        StatusCode: error.statusCode
      });
    }
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * 4. Return & Exchange History
 * Endpoint: GET /api/returns/history
 */
export const getReturnHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const { status, type } = req.query;

    // Build conditions separately and combine, instead of writing to `filter.status`
    // twice -- previously a `type` filter silently clobbered an explicit `status` filter.
    const conditions = [];

    if (status) {
      conditions.push({ status: status.toLowerCase() });
    }

    if (type) {
      const normalizedType = type.toLowerCase();
      if (normalizedType === 'return') {
        conditions.push({ status: { $ne: 'exchanged' } });
        conditions.push({ refundAmount: { $gt: 0 } });
      } else if (normalizedType === 'exchange') {
        conditions.push({ status: 'exchanged' });
      }
    }

    const filter = conditions.length > 0 ? { $and: conditions } : {};

    const total = await Return.countDocuments(filter);
    const returns = await Return.find(filter)
      .populate('invoiceId')
      .populate('productId')
      .populate('approvedBy')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const history = returns.map((ret) => ({
      returnId: ret._id.toString(),
      date: ret.createdAt ? ret.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A',
      invoiceNumber: ret.invoiceId ? ret.invoiceId.invoiceNumber : 'N/A',
      productName: ret.productId ? ret.productId.productName : 'Unknown Product',
      quantity: ret.quantity,
      refundAmount: ret.refundAmount,
      type: ret.status === 'exchanged' ? 'Exchange' : 'Return',
      status: ret.status.charAt(0).toUpperCase() + ret.status.slice(1),
      approvedBy: ret.approvedBy ? ret.approvedBy.username : 'System'
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Return history retrieved successfully.',
      Result: {
        history,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};