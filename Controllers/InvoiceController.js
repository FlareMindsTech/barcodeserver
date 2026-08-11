/**
 * @file InvoiceController.js
 * @description Controller for Invoice Management operations.
 */

import mongoose from 'mongoose';
import Invoice from '../Models/Invoice.js';
import Bill from '../Models/Bill.js';
import BillItem from '../Models/BillItem.js';
import Customer from '../Models/Customer.js';
import Sale from '../Models/Sale.js';
import RetailInventory from '../Models/RetailInventory.js';
import RetailStockMovement from '../Models/RetailStockMovement.js';
import Product from '../Models/Product.js';

import Settings from '../Models/Settings.js';
import { generateInvoiceNumber } from '../Helpers/InvoiceNumberGenerator.js';
import { retryOnDuplicate } from '../Helpers/Numbering.js';

/**
 * Helper to build the full (JSON) invoice detail payload used by both the
 * display endpoint and the print-data endpoint. Frontend renders its own PDF.
 */
const buildInvoiceDetails = async (invoice) => {
  const bill = invoice.billId;

  let customer = null;
  if (bill && bill.customerId) {
    customer = await Customer.findById(bill.customerId);
  }

  const items = bill ? await BillItem.find({ billId: bill._id }).populate('productId') : [];

  const formattedItems = items.map((item) => ({
    itemId: item._id,
    productId: item.productId ? item.productId._id : null,
    productCode: item.productId ? item.productId.productId : null,
    productName: item.productId ? item.productId.productName : 'Unknown Product',
    size: item.productId ? item.productId.size : null,
    color: item.productId ? item.productId.color : null,
    quantity: item.quantity,
    price: item.price,
    gst: item.gst,
    discount: item.discount,
    total: item.total
  }));

  const store = await Settings.findOne();

  return {
    invoiceId: invoice._id.toString(),
    invoiceNumber: invoice.invoiceNumber,
    invoiceStatus: invoice.invoiceStatus,
    createdAt: invoice.createdAt,
    generatedBy: {
      userId: invoice.generatedBy ? invoice.generatedBy._id : null,
      username: invoice.generatedBy ? invoice.generatedBy.username : 'Unknown'
    },
    billDetails: {
      billId: bill ? bill._id.toString() : null,
      billNumber: bill ? bill.billNumber : 'N/A',
      subtotal: bill ? bill.subtotal : 0,
      gstAmount: bill ? bill.gstAmount : 0,
      discountAmount: bill ? bill.discountAmount : 0,
      grandTotal: bill ? bill.grandTotal : 0,
      paymentMethod: bill ? bill.paymentMethod : 'N/A',
      paymentStatus: bill ? bill.paymentStatus : 'N/A'
    },
    customerDetails: customer
      ? {
          customerId: customer._id.toString(),
          customerName: customer.customerName,
          mobile: customer.mobile
        }
      : {
          customerName: 'Walk-in / Guest Customer',
          mobile: 'N/A'
        },
    productList: formattedItems,
    storeDetails: store
      ? {
          shopName: store.shopName,
          shopAddress: store.shopAddress,
          gstNumber: store.gstNumber || '',
          contactNumber: store.contactNumber || '',
          currency: store.currency,
          defaultGstPercentage: store.gstPercentage
        }
      : null
  };
};

/**
 * 1. Generate Invoice
 * Endpoint: POST /api/invoices
 */
export const createInvoice = async (req, res, next) => {
  try {
    const { billId } = req.body;
    const userId = req.user.userId;

    if (!billId) {
      return res.status(400).json({
        Success: false,
        Message: 'Bill ID is required.',
        Result: null,
        StatusCode: 400
      });
    }

    // Lookup bill (by mongoose _id or billNumber)
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

    // Invoice can only be created for a settled (paid) bill — creating one for an
    // unpaid bill previously allowed stock to be "restored" on cancellation even
    // though it was never deducted.
    if (bill.paymentStatus !== 'paid') {
      return res.status(400).json({
        Success: false,
        Message: 'Invoice can only be generated for a paid bill.',
        Result: null,
        StatusCode: 400
      });
    }

    // Check if an invoice already exists for this bill
    let invoice = await Invoice.findOne({ billId: bill._id });
    if (invoice) {
      return res.status(200).json({
        Success: true,
        Message: 'Invoice already generated for this bill.',
        Result: {
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.invoiceStatus === 'generated' ? 'Generated' : 'Cancelled',
          invoiceId: invoice._id.toString()
        },
        StatusCode: 200
      });
    }

    // Generate invoice. Retry on a duplicate invoice-number race (E11000) with
    // a freshly generated number each attempt.
    const freshInvoice = await retryOnDuplicate(async () => {
      const fresh = new Invoice({
        invoiceNumber: await generateInvoiceNumber(),
        billId: bill._id,
        invoiceStatus: 'generated',
        generatedBy: userId
      });
      await fresh.save();
      return fresh;
    });
    invoice = freshInvoice;

    return res.status(201).json({
      Success: true,
      Message: 'Invoice generated successfully.',
      Result: {
        invoiceNumber: invoice.invoiceNumber,
        status: 'Generated',
        invoiceId: invoice._id.toString()
      },
      StatusCode: 201
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Get Invoice Details
 * Endpoint: GET /api/invoices/:invoiceId
 */
export const getInvoice = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(invoiceId)
      ? { $or: [{ _id: invoiceId }, { invoiceNumber: invoiceId }] }
      : { invoiceNumber: invoiceId };

    const invoice = await Invoice.findOne(query)
      .populate('billId')
      .populate('generatedBy');

    if (!invoice) {
      return res.status(404).json({
        Success: false,
        Message: 'Invoice not found.',
        Result: null,
        StatusCode: 404
      });
    }

    const result = await buildInvoiceDetails(invoice);

    return res.status(200).json({
      Success: true,
      Message: 'Invoice retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Get All Invoices
 * Endpoint: GET /api/invoices
 */
export const getAllInvoices = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const { startDate, endDate, customerId, invoiceNumber, q } = req.query;

    const filter = {};

    // 1. Date Range Filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to the end of that day (23:59:59)
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // 2. Invoice Number Search
    if (invoiceNumber) {
      filter.invoiceNumber = { $regex: new RegExp(invoiceNumber.trim(), 'i') };
    } else if (q) {
      filter.invoiceNumber = { $regex: new RegExp(q.trim(), 'i') };
    }

    // 3. Customer Filter
    if (customerId) {
      // Find all bills for this customerId
      const customerBills = await Bill.find({ customerId }).select('_id');
      const billIds = customerBills.map((b) => b._id);
      filter.billId = { $in: billIds };
    }

    // Execute queries
    const total = await Invoice.countDocuments(filter);
    const invoices = await Invoice.find(filter)
      .populate('billId')
      .populate('generatedBy')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Format list response
    const formattedInvoices = [];
    for (const inv of invoices) {
      const bill = inv.billId;
      let customer = null;
      if (bill && bill.customerId) {
        customer = await Customer.findById(bill.customerId);
      }

      formattedInvoices.push({
        invoiceId: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.invoiceStatus,
        createdAt: inv.createdAt,
        grandTotal: bill ? bill.grandTotal : 0,
        paymentMethod: bill ? bill.paymentMethod : 'N/A',
        customerName: customer ? customer.customerName : 'Walk-in / Guest Customer'
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Invoices retrieved successfully.',
      Result: {
        invoices: formattedInvoices,
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

/**
 * 4. Cancel Invoice
 * Endpoint: PUT /api/invoices/:invoiceId/cancel
 */
export const cancelInvoice = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { invoiceId } = req.params;
    const { reason } = req.body;

    const query = mongoose.Types.ObjectId.isValid(invoiceId)
      ? { $or: [{ _id: invoiceId }, { invoiceNumber: invoiceId }] }
      : { invoiceNumber: invoiceId };

    let resultPayload;

    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne(query).session(session);
      if (!invoice) {
        throw { statusCode: 404, message: 'Invoice not found.' };
      }

      if (invoice.invoiceStatus === 'cancelled') {
        throw { statusCode: 400, message: 'Invoice is already cancelled.' };
      }

      const bill = await Bill.findById(invoice.billId).session(session);
      if (!bill) {
        throw { statusCode: 404, message: 'Associated bill not found.' };
      }

      // 1. Mark Invoice as Cancelled
      invoice.invoiceStatus = 'cancelled';
      await invoice.save({ session });

      // 2. Reconcile the sale ledger — the Sale row must not survive a cancelled
      //    invoice, otherwise revenue/quantity reports keep counting it.
      const sale = await Sale.findOneAndDelete({ invoiceId: invoice._id }).session(session);

      // 3. Stock was only deducted for paid bills. Restore it ONLY in that case —
      //    restoring for an unpaid bill would inflate stock.
      const stockRestored = bill.paymentStatus === 'paid' || !!sale;
      if (stockRestored) {
        const items = await BillItem.find({ billId: bill._id }).session(session);
        for (const item of items) {
          await RetailInventory.adjustStock(item.productId, item.quantity, { session });

          const movement = new RetailStockMovement({
            productId: item.productId,
            movementType: 'adjustment',
            quantity: item.quantity,
            remarks: `Restored stock from cancelled invoice ${invoice.invoiceNumber}. Reason: ${reason || 'Not specified'}`
          });
          await movement.save({ session });
        }
      }

      // 4. Bill returns to unpaid only if it was paid (unpaid bills stay unpaid)
      if (bill.paymentStatus === 'paid') {
        bill.paymentStatus = 'unpaid';
        await bill.save({ session });
      }

      resultPayload = {
        invoiceNumber: invoice.invoiceNumber,
        status: 'Cancelled',
        stockRestored
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Invoice cancelled successfully.',
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
 * 5. Get Invoice Print Data (JSON)
 * Endpoint: GET /api/invoices/:invoiceId/print
 * The backend does NOT render PDFs — it returns all data needed for the
 * frontend to generate the PDF (invoice, bill, items, customer, store details).
 */
export const getInvoicePrintData = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(invoiceId)
      ? { $or: [{ _id: invoiceId }, { invoiceNumber: invoiceId }] }
      : { invoiceNumber: invoiceId };

    const invoice = await Invoice.findOne(query)
      .populate('billId')
      .populate('generatedBy');

    if (!invoice) {
      return res.status(404).json({
        Success: false,
        Message: 'Invoice not found.',
        Result: null,
        StatusCode: 404
      });
    }

    const result = await buildInvoiceDetails(invoice);

    return res.status(200).json({
      Success: true,
      Message: 'Invoice print data retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
