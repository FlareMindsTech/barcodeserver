/**
 * @file BillingController.js
 * @description Controller for retail Point of Sale (POS) billing operations.
 */

import mongoose from 'mongoose';
import Bill from '../Models/Bill.js';
import BillItem from '../Models/BillItem.js';
import Product from '../Models/Product.js';
import RetailInventory from '../Models/RetailInventory.js';
import RetailStockMovement from '../Models/RetailStockMovement.js';
import Invoice from '../Models/Invoice.js';
import Sale from '../Models/Sale.js';
import Customer from '../Models/Customer.js';
import Settings from '../Models/Settings.js';
import { generateInvoiceNumber } from '../Helpers/InvoiceNumberGenerator.js';
import { retryOnDuplicate, isDuplicateKeyError } from '../Helpers/Numbering.js';

/**
 * Generate sequential bill number: BILL-YYYYMMDD-SEQ
 */
const generateBillNumber = async () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const prefix = `BILL-${dateStr}-`;

  // Find bills for today and sort descending to get the highest sequence
  const latestBill = await Bill.findOne({
    billNumber: new RegExp(`^${prefix}`)
  }).sort({ billNumber: -1 });

  let nextSeq = 1;
  if (latestBill) {
    const parts = latestBill.billNumber.split('-');
    const seqStr = parts[parts.length - 1];
    const seqNum = parseInt(seqStr, 10);
    if (!isNaN(seqNum)) {
      nextSeq = seqNum + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
};

/**
 * Helper to recalculate Bill totals
 */
const recalculateBillTotals = async (billId) => {
  const items = await BillItem.find({ billId });
  let subtotal = 0;
  let gstAmount = 0;
  let discountAmount = 0;

  for (const item of items) {
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;
    discountAmount += item.discount || 0;

    const taxableAmount = itemSubtotal - (item.discount || 0);
    const itemGst = taxableAmount * (item.gst / 100);
    gstAmount += itemGst;
  }

  const grandTotal = subtotal + gstAmount - discountAmount;

  await Bill.findByIdAndUpdate(billId, {
    subtotal: Number(subtotal.toFixed(2)),
    gstAmount: Number(gstAmount.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    grandTotal: Number(grandTotal.toFixed(2))
  });
};

/**
 * Helper to build an error object with a status code (handled by the global error handler)
 */
const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Helper to check whether the current user owns (created) the given bill.
 * Admins are allowed to operate on any bill.
 */
const assertBillAccess = (bill, userId, role) => {
  if (role !== 'ADMIN' && bill.userId.toString() !== userId) {
    throw httpError(403, 'You can only manage your own bills.');
  }
};

/**
 * Helper to locate an unpaid (open) bill by billId or fall back to a single open bill.
 * Supports multiple concurrent open bills (one per waiting customer).
 * When multiple open bills exist and no billId is given, we refuse rather than guess.
 */
const resolveOpenBill = async (billId, user, isAdmin) => {
  // Explicit per-customer cart
  if (billId) {
    if (!mongoose.Types.ObjectId.isValid(billId)) {
      throw httpError(400, 'Invalid bill ID.');
    }
    const bill = await Bill.findById(billId);
    if (!bill) {
      throw httpError(404, 'Bill not found.');
    }
    assertBillAccess(bill, user.userId, user.role);
    if (bill.paymentStatus !== 'unpaid') {
      throw httpError(400, 'This bill has already been paid or processed.');
    }
    return bill;
  }

  // Legacy fallback: a single open bill for this cashier
  const openBills = await Bill.find({ userId: user.userId, paymentStatus: 'unpaid' }).sort({ createdAt: 1 });
  if (openBills.length === 0) {
    return null; // caller creates a fresh bill
  }
  if (openBills.length === 1) {
    return openBills[0];
  }
  throw httpError(
    400,
    'Multiple open bills detected. Please pass billId to add items to a specific customer bill.'
  );
};

/**
 * 1. Scan Barcode
 * Endpoint: POST /api/billing/scan
 */
export const scanBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.status(400).json({
        Success: false,
        Message: 'Barcode is required.',
        Result: null,
        StatusCode: 400
      });
    }

    // Lookup product by barcode
    const product = await Product.findOne({ barcode, status: 'ACTIVE', isDeleted: { $ne: true } })
      .populate('brandId')
      .populate('categoryId');

    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: 'Product not found or inactive.',
        Result: null,
        StatusCode: 404
      });
    }

    // Return product details formatted for billing
    return res.status(200).json({
      Success: true,
      Message: 'Product retrieved successfully.',
      Result: {
        productId: product._id.toString(),
        productCode: product.productId,
        productName: product.productName,
        price: product.mrp,
        gst: product.gst,
        discount: product.discount
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Search Product
 * Endpoint: GET /api/billing/search
 */
export const searchProducts = async (req, res, next) => {
  try {
    const { productName, barcode, brand, q } = req.query;

    const filter = { status: 'ACTIVE', isDeleted: { $ne: true } };

    if (productName) {
      filter.productName = { $regex: new RegExp(productName.trim(), 'i') };
    }
    if (barcode) {
      filter.barcode = barcode.trim();
    }

    if (brand) {
      filter.brandId = brand;
    }

    if (q) {
      const searchTerm = q.trim();
      filter.$or = [
        { productName: { $regex: new RegExp(searchTerm, 'i') } },
        { barcode: searchTerm }
      ];
    }

    const products = await Product.find(filter)
      .populate('brandId')
      .populate('categoryId')
      .limit(20);

    const formattedProducts = products.map((product) => ({
      productId: product._id.toString(),
      productCode: product.productId,
      productName: product.productName,
      price: product.mrp,
      gst: product.gst,
      discount: product.discount,
      barcode: product.barcode,
      size: product.size,
      color: product.color
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Products searched successfully.',
      Result: formattedProducts,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a fresh Bill document, retrying the sequence-number allocation when a
 * concurrent request grabbed the same BILL-YYYYMMDD-SEQ number (E11000).
 */
const createNewBill = async ({ customerId, userId }) => {
  return retryOnDuplicate(async () => {
    const bill = new Bill({
      billNumber: await generateBillNumber(),
      customerId: customerId && mongoose.Types.ObjectId.isValid(customerId) ? customerId : null,
      userId,
      subtotal: 0,
      gstAmount: 0,
      discountAmount: 0,
      grandTotal: 0,
      paymentMethod: 'cash',
      paymentStatus: 'unpaid'
    });
    await bill.save();
    return bill;
  });
};

/**
 * 2b. Start a new bill (new waiting customer)
 * Endpoint: POST /api/billing/bills
 * Body: { customerId?: string }
 * Each waiting customer gets its own bill; items/payment are isolated per bill.
 */
export const createBill = async (req, res, next) => {
  try {
    const { customerId } = req.body;
    const userId = req.user.userId;

    const bill = await createNewBill({ customerId, userId });

    return res.status(201).json({
      Success: true,
      Message: 'New bill started successfully.',
      Result: {
        bill
      },
      StatusCode: 201
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2c. List all open (unpaid) bills for the current cashier — the "waiting customers" queue
 * Endpoint: GET /api/billing/bills
 */
export const getOpenBills = async (req, res, next) => {
  try {
    const calls = req.user.role === 'ADMIN' ? {} : { userId: req.user.userId };
    const bills = await Bill.find({ paymentStatus: 'unpaid', ...calls })
      .populate('customerId', 'customerName mobile status')
      .sort({ createdAt: 1 });

    const queue = [];
    for (const bill of bills) {
      const items = await BillItem.find({ billId: bill._id }).populate('productId');
      queue.push({ bill, items });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Open bills retrieved successfully.',
      Result: queue,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2d. Discard an open (unpaid, empty or not) bill
 * Endpoint: DELETE /api/billing/bills/:billId
 */
export const deleteBill = async (req, res, next) => {
  try {
    const { billId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(billId)) {
      return res.status(400).json({
        Success: false,
        Message: 'Invalid bill ID.',
        Result: null,
        StatusCode: 400
      });
    }

    const bill = await Bill.findById(billId);
    if (!bill) {
      return res.status(404).json({
        Success: false,
        Message: 'Bill not found.',
        Result: null,
        StatusCode: 404
      });
    }

    assertBillAccess(bill, req.user.userId, req.user.role);

    if (bill.paymentStatus !== 'unpaid') {
      return res.status(400).json({
        Success: false,
        Message: 'Cannot delete a completed bill.',
        Result: null,
        StatusCode: 400
      });
    }

    await BillItem.deleteMany({ billId: bill._id });
    await Bill.findByIdAndDelete(bill._id);

    return res.status(200).json({
      Success: true,
      Message: 'Bill discarded successfully.',
      Result: null,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Add Item
 * Endpoint: POST /api/billing/items
 */
export const addItem = async (req, res, next) => {
  try {
    const { billId, productId, quantity, customerId } = req.body;
    const userId = req.user.userId;

    if (!productId) {
      return res.status(400).json({
        Success: false,
        Message: 'Product ID is required.',
        Result: null,
        StatusCode: 400
      });
    }

    const parsedQty = parseInt(quantity, 10) || 1;
    if (parsedQty <= 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Quantity must be at least 1.',
        Result: null,
        StatusCode: 400
      });
    }

    // 1. Verify product
    const productQuery = mongoose.Types.ObjectId.isValid(productId)
      ? { $or: [{ _id: productId }, { productId }] }
      : { productId };

    const product = await Product.findOne({ ...productQuery, status: 'ACTIVE', isDeleted: { $ne: true } });
    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: 'Product not found or inactive.',
        Result: null,
        StatusCode: 404
      });
    }

    // 2. Resolve the per-customer bill (new bill if none open) — each waiting customer
    //    gets its own bill so customers never share/mix carts.
    let bill = await resolveOpenBill(billId, req.user, req.user.role);
    if (!bill) {
      bill = await createNewBill({ customerId, userId });
    } else if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      bill.customerId = customerId;
      await bill.save();
    }

    // 3. Find if item already exists in this bill
    const existingItem = await BillItem.findOne({ billId: bill._id, productId: product._id });
    const currentQtyInBill = existingItem ? existingItem.quantity : 0;
    const totalRequiredQty = currentQtyInBill + parsedQty;

    // 4. Check Stock Availability
    const retailInventory = await RetailInventory.findOne({ productId: product._id });
    if (!retailInventory || retailInventory.quantity < totalRequiredQty) {
      const available = retailInventory ? retailInventory.quantity : 0;
      return res.status(400).json({
        Success: false,
        Message: `Insufficient Stock. Available retail stock: ${available}, requested total in bill: ${totalRequiredQty}`,
        Result: null,
        StatusCode: 400
      });
    }

    // 5. Add or update item details
    const settings = await Settings.findOne();
    const defaultDiscount = settings ? settings.defaultDiscount : 0;
    const defaultGst = settings ? settings.gstPercentage : 18;

    const price = product.mrp;
    const gst = (product.gst !== undefined && product.gst > 0) ? product.gst : defaultGst;
    const discountPercent = (product.discount !== undefined && product.discount > 0) ? product.discount : defaultDiscount;

    if (existingItem) {
      existingItem.quantity = totalRequiredQty;
      // Calculate updated discount, gst amount and total
      const sub = price * totalRequiredQty;
      const disc = sub * (discountPercent / 100);
      const taxable = sub - disc;
      const gstAmt = taxable * (gst / 100);
      existingItem.discount = Number(disc.toFixed(2));
      existingItem.total = Number((taxable + gstAmt).toFixed(2));
      await existingItem.save();
    } else {
      const sub = price * parsedQty;
      const disc = sub * (discountPercent / 100);
      const taxable = sub - disc;
      const gstAmt = taxable * (gst / 100);

      const newItem = new BillItem({
        billId: bill._id,
        productId: product._id,
        quantity: parsedQty,
        price,
        gst,
        discount: Number(disc.toFixed(2)),
        total: Number((taxable + gstAmt).toFixed(2))
      });
      await newItem.save();
    }

    // 6. Recalculate bill totals
    await recalculateBillTotals(bill._id);

    const updatedBill = await Bill.findById(bill._id);
    const billItems = await BillItem.find({ billId: bill._id }).populate('productId');

    return res.status(200).json({
      Success: true,
      Message: 'Item added to bill successfully.',
      Result: {
        bill: updatedBill,
        items: billItems
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Remove Item
 * Endpoint: DELETE /api/billing/items/:itemId
 */
export const removeItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        Success: false,
        Message: 'Invalid Item ID.',
        Result: null,
        StatusCode: 400
      });
    }

    const billItem = await BillItem.findById(itemId);
    if (!billItem) {
      return res.status(404).json({
        Success: false,
        Message: 'Bill item not found.',
        Result: null,
        StatusCode: 404
      });
    }

    const billId = billItem.billId;

    // Verify bill status is unpaid
    const bill = await Bill.findById(billId);
    if (!bill) {
      return res.status(404).json({
        Success: false,
        Message: 'Associated bill not found.',
        Result: null,
        StatusCode: 404
      });
    }

    if (bill.paymentStatus !== 'unpaid') {
      return res.status(400).json({
        Success: false,
        Message: 'Cannot modify a completed bill.',
        Result: null,
        StatusCode: 400
      });
    }

    assertBillAccess(bill, req.user.userId, req.user.role);

    // Delete item
    await BillItem.findByIdAndDelete(itemId);

    // Recalculate totals
    await recalculateBillTotals(billId);

    const updatedBill = await Bill.findById(billId);
    const remainingItems = await BillItem.find({ billId }).populate('productId');

    return res.status(200).json({
      Success: true,
      Message: 'Item removed from bill successfully.',
      Result: {
        bill: updatedBill,
        items: remainingItems
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Update Quantity
 * Endpoint: PUT /api/billing/items/:itemId
 */
export const updateQuantity = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        Success: false,
        Message: 'Invalid Item ID.',
        Result: null,
        StatusCode: 400
      });
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Quantity must be at least 1.',
        Result: null,
        StatusCode: 400
      });
    }

    const billItem = await BillItem.findById(itemId);
    if (!billItem) {
      return res.status(404).json({
        Success: false,
        Message: 'Bill item not found.',
        Result: null,
        StatusCode: 404
      });
    }

    const billId = billItem.billId;

    // Verify bill status is unpaid
    const bill = await Bill.findById(billId);
    if (!bill) {
      return res.status(404).json({
        Success: false,
        Message: 'Associated bill not found.',
        Result: null,
        StatusCode: 404
      });
    }

    if (bill.paymentStatus !== 'unpaid') {
      return res.status(400).json({
        Success: false,
        Message: 'Cannot modify a completed bill.',
        Result: null,
        StatusCode: 400
      });
    }

    assertBillAccess(bill, req.user.userId, req.user.role);

    // Check Stock Availability
    const retailInventory = await RetailInventory.findOne({ productId: billItem.productId });
    if (!retailInventory || retailInventory.quantity < parsedQty) {
      const available = retailInventory ? retailInventory.quantity : 0;
      return res.status(400).json({
        Success: false,
        Message: `Insufficient Stock. Available retail stock: ${available}, requested: ${parsedQty}`,
        Result: null,
        StatusCode: 400
      });
    }

    // Get product discount and tax configuration
    const product = await Product.findById(billItem.productId);
    const settings = await Settings.findOne();
    const defaultDiscount = settings ? settings.defaultDiscount : 0;
    const defaultGst = settings ? settings.gstPercentage : 18;

    const gst = (product && product.gst !== undefined && product.gst > 0) ? product.gst : (billItem.gst || defaultGst);
    const discountPercent = (product && product.discount !== undefined && product.discount > 0) ? product.discount : defaultDiscount;

    // Recalculate item totals
    const sub = billItem.price * parsedQty;
    const disc = sub * (discountPercent / 100);
    const taxable = sub - disc;
    const gstAmt = taxable * (gst / 100);

    billItem.quantity = parsedQty;
    billItem.discount = Number(disc.toFixed(2));
    billItem.total = Number((taxable + gstAmt).toFixed(2));
    await billItem.save();

    // Recalculate bill totals
    await recalculateBillTotals(billId);

    const updatedBill = await Bill.findById(billId);
    const remainingItems = await BillItem.find({ billId }).populate('productId');

    return res.status(200).json({
      Success: true,
      Message: 'Item quantity updated successfully.',
      Result: {
        bill: updatedBill,
        items: remainingItems
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Generate Bill
 * Endpoint: POST /api/billing/generate
 */
export const generateBill = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { billId } = req.body;

    // Resolve the bill: explicit billId or the cashier's single open bill
    const bill = await resolveOpenBill(billId, req.user, req.user.role);
    if (!bill) {
      return res.status(404).json({
        Success: false,
        Message: 'No active unpaid bill found to generate.',
        Result: null,
        StatusCode: 404
      });
    }

    // Check if bill has items
    const itemsCount = await BillItem.countDocuments({ billId: bill._id });
    if (itemsCount === 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Cannot generate a bill with 0 items. Please add items first.',
        Result: null,
        StatusCode: 400
      });
    }

    // Recalculate everything to ensure consistency
    await recalculateBillTotals(bill._id);
    const finalBill = await Bill.findById(bill._id);

    return res.status(200).json({
      Success: true,
      Message: 'Bill generated successfully.',
      Result: {
        billNumber: finalBill.billNumber,
        grandTotal: finalBill.grandTotal,
        billId: finalBill._id.toString(),
        subtotal: finalBill.subtotal,
        gstAmount: finalBill.gstAmount,
        discountAmount: finalBill.discountAmount
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7. Process Payment
 * Endpoint: POST /api/billing/payment
 */
export const processPayment = async (req, res, next) => {
  try {
    const { billId, paymentMethod } = req.body;
    const userId = req.user.userId;

    if (!billId || !paymentMethod) {
      return res.status(400).json({
        Success: false,
        Message: 'Bill ID and payment method are required.',
        Result: null,
        StatusCode: 400
      });
    }

    // Find the bill (support lookup by either mongoose _id or billNumber string)
    const billQuery = mongoose.Types.ObjectId.isValid(billId)
      ? { $or: [{ _id: billId }, { billNumber: billId }] }
      : { billNumber: billId };

    const bill = await Bill.findOne(billQuery);
    if (!bill) {
      return res.status(404).json({
        Success: false,
        Message: 'Bill not found.',
        Result: null,
        StatusCode: 404
      });
    }

    // Verify the bill belongs to the current cashier (admins may pay any bill)
    assertBillAccess(bill, userId, req.user.role);

    // Verify status is unpaid
    if (bill.paymentStatus !== 'unpaid') {
      return res.status(400).json({
        Success: false,
        Message: 'This bill has already been paid or processed.',
        Result: null,
        StatusCode: 400
      });
    }

    // Validate and normalize payment method
    const inputMethod = paymentMethod.trim().toLowerCase();
    let normMethod;
    if (inputMethod === 'upi') {
      normMethod = 'upi';
    } else if (inputMethod === 'cash') {
      normMethod = 'cash';
    } else if (['card', 'credit card', 'debit card'].includes(inputMethod)) {
      normMethod = 'card';
    } else if (inputMethod === 'credit') {
      normMethod = 'credit';
    } else if (inputMethod === 'split') {
      normMethod = 'split';
    } else {
      return res.status(400).json({
        Success: false,
        Message: `Invalid payment method. Supported: UPI, Cash, Credit Card, Debit Card, Credit, Split.`,
        Result: null,
        StatusCode: 400
      });
    }

    // Get bill items
    const items = await BillItem.find({ billId: bill._id });
    if (items.length === 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Cannot process payment for a bill with 0 items.',
        Result: null,
        StatusCode: 400
      });
    }

    let resultPayload;

    // Retry the whole transaction on a duplicate invoice-number insert (E11000).
    // Regenerating inside each attempt gives the loser of a number race a fresh
    // sequence value; a failed attempt rolls back all its earlier writes, so
    // re-running from scratch is safe.
    for (let attempt = 0; attempt < 4; attempt++) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          // 1. Atomically reduce stock with a guarded update so two cashiers can never
          //    oversell the same product or push it below zero.
          for (const item of items) {
            const updatedInventory = await RetailInventory.findOneAndUpdate(
              { productId: item.productId, quantity: { $gte: item.quantity } },
              { $inc: { quantity: -item.quantity } },
              { session, new: true, runValidators: true }
            );

            if (!updatedInventory) {
              const available = await RetailInventory.findOne({ productId: item.productId }).session(session);
              const product = await Product.findById(item.productId).session(session);
              throw httpError(
                400,
                `Payment Failed due to Insufficient Stock for "${product ? product.productName : 'Product'}". Available: ${available ? available.quantity : 0}.`
              );
            }

            const movement = new RetailStockMovement({
              productId: item.productId,
              movementType: 'sale',
              quantity: -item.quantity,
              remarks: `Retail sale transaction for bill ${bill.billNumber}`
            });
            await movement.save({ session });
          }

          // 2. Complete Bill Transaction
          bill.paymentMethod = normMethod;
          bill.paymentStatus = 'paid';
          await bill.save({ session });

          // 3. Generate legal tax invoice (number allocated inside the txn; a
          //    concurrent duplicate aborts and the transaction is retried)
          const invoice = new Invoice({
            invoiceNumber: await generateInvoiceNumber(),
            billId: bill._id,
            invoiceStatus: 'generated',
            generatedBy: userId
          });
          await invoice.save({ session });

          // 4. Save Sale record
          const sale = new Sale({
            billId: bill._id,
            invoiceId: invoice._id,
            customerId: bill.customerId,
            totalAmount: bill.grandTotal,
            paymentMethod: normMethod,
            saleDate: new Date()
          });
          await sale.save({ session });

          resultPayload = {
            billNumber: bill.billNumber,
            invoiceNumber: invoice.invoiceNumber,
            grandTotal: bill.grandTotal,
            paymentStatus: bill.paymentStatus,
            paymentMethod: bill.paymentMethod,
            saleDate: sale.saleDate
          };
        });

        // 5. Return response
        return res.status(200).json({
          Success: true,
          Message: 'Payment processed successfully. Transaction completed.',
          Result: resultPayload,
          StatusCode: 200
        });
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt >= 3) {
          throw error;
        }
        // Duplicate invoice number — drop this session and retry the whole txn.
      } finally {
        session.endSession();
      }
    }
  } catch (error) {
    next(error);
  }
};
