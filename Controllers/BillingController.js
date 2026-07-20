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

const generateInvoiceNumber = async () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  let invoicePrefix = 'INV';
  const settings = await Settings.findOne();
  if (settings && settings.invoicePrefix) {
    invoicePrefix = settings.invoicePrefix.trim().replace(/-$/, '');
  }

  const prefix = `${invoicePrefix}-${dateStr}-`;

  // Find invoices for today and sort descending
  const latestInvoice = await Invoice.findOne({
    invoiceNumber: new RegExp(`^${prefix}`)
  }).sort({ invoiceNumber: -1 });

  let nextSeq = 1;
  if (latestInvoice) {
    const parts = latestInvoice.invoiceNumber.split('-');
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
 * 3. Add Item
 * Endpoint: POST /api/billing/items
 */
export const addItem = async (req, res, next) => {
  try {
    const { productId, quantity, customerId } = req.body;
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

    // 2. Check active bill or create one
    let bill = await Bill.findOne({ userId, paymentStatus: 'unpaid' });
    if (!bill) {
      bill = new Bill({
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

    // Find active unpaid bill for this user
    const bill = await Bill.findOne({ userId, paymentStatus: 'unpaid' });
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

    // 1. Double check stock for all items
    for (const item of items) {
      const retailInventory = await RetailInventory.findOne({ productId: item.productId });
      if (!retailInventory || retailInventory.quantity < item.quantity) {
        const available = retailInventory ? retailInventory.quantity : 0;
        const product = await Product.findById(item.productId);
        const name = product ? product.productName : 'Product';
        return res.status(400).json({
          Success: false,
          Message: `Payment Failed due to Insufficient Stock for "${name}". Available: ${available}, requested: ${item.quantity}`,
          Result: null,
          StatusCode: 400
        });
      }
    }

    // 2. Reduce stock & create stock movements
    for (const item of items) {
      await RetailInventory.adjustStock(item.productId, -item.quantity);

      const movement = new RetailStockMovement({
        productId: item.productId,
        movementType: 'sale',
        quantity: -item.quantity,
        remarks: `Retail sale transaction for bill ${bill.billNumber}`
      });
      await movement.save();
    }

    // 3. Complete Bill Transaction
    bill.paymentMethod = normMethod;
    bill.paymentStatus = 'paid';
    await bill.save();

    // 4. Generate legal Tax Invoice
    const invoice = new Invoice({
      invoiceNumber: await generateInvoiceNumber(),
      billId: bill._id,
      invoiceStatus: 'generated',
      generatedBy: userId
    });
    await invoice.save();

    // 5. Save Sale record
    const sale = new Sale({
      billId: bill._id,
      invoiceId: invoice._id,
      customerId: bill.customerId,
      totalAmount: bill.grandTotal,
      paymentMethod: normMethod,
      saleDate: new Date()
    });
    await sale.save();

    // 6. Return response
    return res.status(200).json({
      Success: true,
      Message: 'Payment processed successfully. Transaction completed.',
      Result: {
        billNumber: bill.billNumber,
        invoiceNumber: invoice.invoiceNumber,
        grandTotal: bill.grandTotal,
        paymentStatus: bill.paymentStatus,
        paymentMethod: bill.paymentMethod,
        saleDate: sale.saleDate
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
