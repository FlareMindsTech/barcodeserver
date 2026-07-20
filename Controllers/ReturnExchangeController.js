/**
 * @file ReturnExchangeController.js
 * @description Controller for Return, Exchange, and Refund Management operations.
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

/**
 * Helper to resolve product reference by ID, Code, or Barcode
 */
const findProduct = async (productRef) => {
  const query = mongoose.Types.ObjectId.isValid(productRef)
    ? { $or: [{ _id: productRef }, { productId: productRef }, { barcode: productRef }] }
    : { $or: [{ productId: productRef }, { barcode: productRef }] };
  return await Product.findOne(query);
};

/**
 * 1. Return Product
 * Endpoint: POST /api/returns
 */
export const returnProduct = async (req, res, next) => {
  try {
    const { invoiceNumber, productId, quantity, reason } = req.body;
    const userId = req.user.userId;

    if (!invoiceNumber || !productId || !quantity) {
      return res.status(400).json({
        Success: false,
        Message: 'invoiceNumber, productId, and quantity are required.',
        Result: null,
        StatusCode: 400
      });
    }

    // 1. Verify Invoice
    const invoice = await Invoice.findOne({ invoiceNumber }).populate('billId');
    if (!invoice) {
      return res.status(404).json({
        Success: false,
        Message: `Invoice ${invoiceNumber} not found.`,
        Result: null,
        StatusCode: 404
      });
    }

    if (invoice.invoiceStatus === 'cancelled') {
      return res.status(400).json({
        Success: false,
        Message: 'Cannot return products from a cancelled invoice.',
        Result: null,
        StatusCode: 400
      });
    }

    // 2. Verify Product
    const product = await findProduct(productId);
    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: `Product ${productId} not found.`,
        Result: null,
        StatusCode: 404
      });
    }

    // 3. Find Product in Invoice (via BillItem)
    const billItem = await BillItem.findOne({
      billId: invoice.billId._id,
      productId: product._id
    });
    if (!billItem) {
      return res.status(400).json({
        Success: false,
        Message: 'This product was not purchased in the specified invoice.',
        Result: null,
        StatusCode: 400
      });
    }

    // 4. Validate quantity limits
    const existingReturns = await Return.find({
      invoiceId: invoice._id,
      productId: product._id,
      status: { $in: ['approved', 'refunded', 'exchanged'] }
    });
    const totalAlreadyReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);

    if (totalAlreadyReturned + quantity > billItem.quantity) {
      return res.status(400).json({
        Success: false,
        Message: `Maximum return quantity exceeded. Already returned: ${totalAlreadyReturned}, Purchased: ${billItem.quantity}, Requested: ${quantity}.`,
        Result: null,
        StatusCode: 400
      });
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
    await newReturn.save();

    // 7. Restore Retail Stock and log movement
    await RetailInventory.adjustStock(product._id, quantity);
    const movement = new RetailStockMovement({
      productId: product._id,
      movementType: 'return',
      quantity,
      remarks: `Restored stock from returned invoice ${invoiceNumber}`
    });
    await movement.save();

    return res.status(200).json({
      Success: true,
      Message: 'Product returned successfully.',
      Result: {
        returnId: newReturn._id.toString(),
        refundAmount: newReturn.refundAmount,
        status: 'Approved'
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Exchange Product
 * Endpoint: POST /api/exchanges
 */
export const exchangeProduct = async (req, res, next) => {
  try {
    const { invoiceNumber, oldProductId, newProductId, quantity } = req.body;
    const userId = req.user.userId;

    if (!invoiceNumber || !oldProductId || !newProductId || !quantity) {
      return res.status(400).json({
        Success: false,
        Message: 'invoiceNumber, oldProductId, newProductId, and quantity are required.',
        Result: null,
        StatusCode: 400
      });
    }

    // 1. Verify Invoice
    const invoice = await Invoice.findOne({ invoiceNumber }).populate('billId');
    if (!invoice) {
      return res.status(404).json({
        Success: false,
        Message: `Invoice ${invoiceNumber} not found.`,
        Result: null,
        StatusCode: 404
      });
    }

    // 2. Verify Old Product
    const oldProduct = await findProduct(oldProductId);
    if (!oldProduct) {
      return res.status(404).json({
        Success: false,
        Message: `Old Product ${oldProductId} not found.`,
        Result: null,
        StatusCode: 404
      });
    }

    // 3. Verify New Product
    const newProduct = await findProduct(newProductId);
    if (!newProduct) {
      return res.status(404).json({
        Success: false,
        Message: `New Product ${newProductId} not found.`,
        Result: null,
        StatusCode: 404
      });
    }

    // 4. Verify Original Purchase
    const oldBillItem = await BillItem.findOne({
      billId: invoice.billId._id,
      productId: oldProduct._id
    });
    if (!oldBillItem) {
      return res.status(400).json({
        Success: false,
        Message: 'The old product was not purchased in the specified invoice.',
        Result: null,
        StatusCode: 400
      });
    }

    // Validate return quantity of old product
    const existingReturns = await Return.find({
      invoiceId: invoice._id,
      productId: oldProduct._id,
      status: { $in: ['approved', 'refunded', 'exchanged'] }
    });
    const totalAlreadyReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);

    if (totalAlreadyReturned + quantity > oldBillItem.quantity) {
      return res.status(400).json({
        Success: false,
        Message: `Maximum exchange/return quantity exceeded. Already returned/exchanged: ${totalAlreadyReturned}, Purchased: ${oldBillItem.quantity}, Requested: ${quantity}.`,
        Result: null,
        StatusCode: 400
      });
    }

    // 5. Check New Product Stock
    const newInventory = await RetailInventory.findOne({ productId: newProduct._id });
    if (!newInventory || newInventory.quantity < quantity) {
      return res.status(400).json({
        Success: false,
        Message: `Insufficient stock for the exchange product: ${newProduct.productName}. Available: ${newInventory ? newInventory.quantity : 0}.`,
        Result: null,
        StatusCode: 400
      });
    }

    // 6. Calculate Price Difference
    // Calculate old item's net unit refund value (including original discount/GST)
    const oldUnitRefund = oldBillItem.total / oldBillItem.quantity;
    const totalOldVal = oldUnitRefund * quantity;

    // Calculate new item's net price (MRP + GST - Discount)
    const newUnitGst = newProduct.mrp * (newProduct.gst / 100);
    const newUnitDisc = newProduct.mrp * (newProduct.discount / 100);
    const newUnitTotal = newProduct.mrp + newUnitGst - newUnitDisc;
    const totalNewVal = newUnitTotal * quantity;

    const priceDifference = totalNewVal - totalOldVal;

    // 7. Update Retail Inventory
    // Restore Old Product
    await RetailInventory.adjustStock(oldProduct._id, quantity);
    const restoreMovement = new RetailStockMovement({
      productId: oldProduct._id,
      movementType: 'return',
      quantity,
      remarks: `Restored stock from exchange return on invoice ${invoiceNumber}`
    });
    await restoreMovement.save();

    // Deduct New Product
    await RetailInventory.adjustStock(newProduct._id, -quantity);
    const deductMovement = new RetailStockMovement({
      productId: newProduct._id,
      movementType: 'sale',
      quantity,
      remarks: `Deducted stock for exchange delivery on invoice ${invoiceNumber}`
    });
    await deductMovement.save();

    // 8. Save Exchange Return history
    const exchangeReturn = new Return({
      invoiceId: invoice._id,
      productId: oldProduct._id,
      quantity,
      refundAmount: 0, // Since it's swapped for a product
      returnReason: `Exchanged for ${newProduct.productName}`,
      status: 'exchanged',
      approvedBy: userId
    });
    await exchangeReturn.save();

    const formattedDiff = parseFloat(priceDifference.toFixed(2));
    let action = 'Even Exchange';
    if (formattedDiff > 0) {
      action = 'Customer Pays';
    } else if (formattedDiff < 0) {
      action = 'Refund Customer';
    }

    return res.status(200).json({
      Success: true,
      Message: 'Product exchanged successfully.',
      Result: {
        priceDifference: formattedDiff,
        action,
        amount: Math.abs(formattedDiff),
        returnId: exchangeReturn._id.toString()
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Process Refund
 * Endpoint: POST /api/refunds
 */
export const processRefund = async (req, res, next) => {
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

    // 1. Validate Refund Method
    const allowedMethods = ['cash', 'card', 'upi', 'store_credit'];
    if (!allowedMethods.includes(refundMethod.toLowerCase())) {
      return res.status(400).json({
        Success: false,
        Message: `Invalid refund method. Allowed values: ${allowedMethods.join(', ')}`,
        Result: null,
        StatusCode: 400
      });
    }

    // 2. Verify Return
    const returnDoc = await Return.findById(returnId);
    if (!returnDoc) {
      return res.status(404).json({
        Success: false,
        Message: 'Return record not found.',
        Result: null,
        StatusCode: 404
      });
    }

    if (returnDoc.status === 'refunded') {
      return res.status(400).json({
        Success: false,
        Message: 'Refund has already been completed for this return.',
        Result: null,
        StatusCode: 400
      });
    }

    if (returnDoc.status === 'rejected') {
      return res.status(400).json({
        Success: false,
        Message: 'Cannot process refund for a rejected return request.',
        Result: null,
        StatusCode: 400
      });
    }

    // 3. Create Refund record
    const refund = new Refund({
      returnId: returnDoc._id,
      refundMethod: refundMethod.toLowerCase(),
      amount: returnDoc.refundAmount,
      status: 'completed',
      processedAt: new Date()
    });
    await refund.save();

    // 4. Update Return status to refunded
    returnDoc.status = 'refunded';
    await returnDoc.save();

    return res.status(200).json({
      Success: true,
      Message: 'Refund processed successfully.',
      Result: {
        refundId: refund._id.toString(),
        amount: refund.amount,
        status: 'completed'
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
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

    const filter = {};

    if (status) {
      filter.status = status.toLowerCase();
    }

    // Filter by type: 'return' (non-zero refundAmount) vs 'exchange' (status == exchanged or refundAmount == 0)
    if (type) {
      if (type.toLowerCase() === 'return') {
        filter.status = { $ne: 'exchanged' };
        filter.refundAmount = { $gt: 0 };
      } else if (type.toLowerCase() === 'exchange') {
        filter.status = 'exchanged';
      }
    }

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
      date: ret.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
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
