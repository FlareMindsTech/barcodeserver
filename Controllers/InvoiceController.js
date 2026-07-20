/**
 * @file InvoiceController.js
 * @description Controller for Invoice Management operations.
 */

import mongoose from 'mongoose';
import Invoice from '../Models/Invoice.js';
import Bill from '../Models/Bill.js';
import BillItem from '../Models/BillItem.js';
import Customer from '../Models/Customer.js';
import RetailInventory from '../Models/RetailInventory.js';
import RetailStockMovement from '../Models/RetailStockMovement.js';
import Product from '../Models/Product.js';
import { generateInvoicePdfBuffer } from '../Helpers/PdfGenerator.js';

import Settings from '../Models/Settings.js';

/**
 * Helper to generate sequential invoice number: [Prefix]-YYYYMMDD-SEQ
 */
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

  return `${prefix}${String(nextSeq).padStart(4, '0')}`; // Pad with 4 digits as per objective: INV-20260709-0001
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

    // Generate invoice
    const invoiceNumber = await generateInvoiceNumber();
    invoice = new Invoice({
      invoiceNumber,
      billId: bill._id,
      invoiceStatus: 'generated',
      generatedBy: userId
    });
    await invoice.save();

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

    const bill = invoice.billId;

    // Get customer details
    let customer = null;
    if (bill && bill.customerId) {
      customer = await Customer.findById(bill.customerId);
    }

    // Get item list
    const items = await BillItem.find({ billId: bill._id }).populate('productId');

    const formattedItems = items.map((item) => ({
      itemId: item._id,
      productId: item.productId ? item.productId._id : null,
      productCode: item.productId ? item.productId.productId : null,
      productName: item.productId ? item.productId.productName : 'Unknown Product',
      quantity: item.quantity,
      price: item.price,
      gst: item.gst,
      discount: item.discount,
      total: item.total
    }));

    const result = {
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.invoiceStatus,
      createdAt: invoice.createdAt,
      generatedBy: {
        userId: invoice.generatedBy ? invoice.generatedBy._id : null,
        username: invoice.generatedBy ? invoice.generatedBy.username : 'Unknown'
      },
      billDetails: {
        billId: bill._id.toString(),
        billNumber: bill.billNumber,
        subtotal: bill.subtotal,
        gstAmount: bill.gstAmount,
        discountAmount: bill.discountAmount,
        grandTotal: bill.grandTotal,
        paymentMethod: bill.paymentMethod,
        paymentStatus: bill.paymentStatus
      },
      customerDetails: customer ? {
        customerId: customer._id.toString(),
        customerName: customer.customerName,
        mobile: customer.mobile
      } : {
        customerName: 'Walk-in / Guest Customer',
        mobile: 'N/A'
      },
      productList: formattedItems
    };

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
  try {
    const { invoiceId } = req.params;
    const { reason } = req.body;

    const query = mongoose.Types.ObjectId.isValid(invoiceId)
      ? { $or: [{ _id: invoiceId }, { invoiceNumber: invoiceId }] }
      : { invoiceNumber: invoiceId };

    const invoice = await Invoice.findOne(query);
    if (!invoice) {
      return res.status(404).json({
        Success: false,
        Message: 'Invoice not found.',
        Result: null,
        StatusCode: 404
      });
    }

    if (invoice.invoiceStatus === 'cancelled') {
      return res.status(400).json({
        Success: false,
        Message: 'Invoice is already cancelled.',
        Result: null,
        StatusCode: 400
      });
    }

    // 1. Mark Invoice as Cancelled
    invoice.invoiceStatus = 'cancelled';
    await invoice.save();

    // 2. Also update associated Bill's paymentStatus if applicable
    const bill = await Bill.findById(invoice.billId);
    if (bill) {
      bill.paymentStatus = 'unpaid'; // Marks bill unpaid on cancel
      await bill.save();

      // 3. Restore Retail Stock and log movement
      const items = await BillItem.find({ billId: bill._id });
      for (const item of items) {
        await RetailInventory.adjustStock(item.productId, item.quantity);

        const movement = new RetailStockMovement({
          productId: item.productId,
          movementType: 'adjustment',
          quantity: item.quantity,
          remarks: `Restored stock from cancelled invoice ${invoice.invoiceNumber}. Reason: ${reason || 'Not specified'}`
        });
        await movement.save();
      }
    }

    return res.status(200).json({
      Success: true,
      Message: 'Invoice cancelled successfully and inventory restored.',
      Result: {
        invoiceNumber: invoice.invoiceNumber,
        status: 'Cancelled'
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Download Invoice PDF
 * Endpoint: GET /api/invoices/:invoiceId/pdf
 */
export const downloadInvoicePdf = async (req, res, next) => {
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

    const bill = invoice.billId;
    if (!bill) {
      return res.status(400).json({
        Success: false,
        Message: 'Associated bill not found for this invoice.',
        Result: null,
        StatusCode: 400
      });
    }

    // Get customer
    let customer = null;
    if (bill.customerId) {
      customer = await Customer.findById(bill.customerId);
    }

    // Get items populated with product name
    const items = await BillItem.find({ billId: bill._id }).populate('productId');

    // Generate PDF Buffer
    const pdfBuffer = await generateInvoicePdfBuffer(invoice, bill, items, customer);

    // Set Response Headers for direct PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};
