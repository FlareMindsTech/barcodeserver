/**
 * @file Invoice.js
 * @description Mongoose model for legal Tax Invoices referencing Bills.
 * 
 * @relationship
 * - Invoice (Many) -> Bill (1) via `billId`
 * - Invoice (Many) -> User (1) via `generatedBy`
 * 
 * @indexes
 * - Single-field index on `invoiceNumber` (Unique, ascending) for fast lookups.
 * - Single-field index on `billId` for invoice-to-bill lookup.
 * - Single-field index on `createdAt` (Descending) for accounting timelines.
 * 
 * @validation
 * - invoiceNumber: Required, unique, trimmed.
 * - billId: Required, Schema.Types.ObjectId.
 * - pdfUrl: Optional, trimmed string representing the PDF location (S3, Cloudinary, etc.).
 * - invoiceStatus: Required, enum ['generated', 'cancelled'].
 * - generatedBy: Required, Schema.Types.ObjectId (User who generated it).
 * 
 * @example
 * {
 *   "invoiceNumber": "INV-2026-0001",
 *   "billId": "60d0fe4f5311236168a109d3",
 *   "pdfUrl": "https://storage.googleapis.com/.../INV-2026-0001.pdf",
 *   "invoiceStatus": "generated",
 *   "generatedBy": "60d0fe4f5311236168a109c9",
 *   "createdAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const InvoiceSchema = new Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      trim: true
    },
    billId: {
      type: Schema.Types.ObjectId,
      ref: 'Bill',
      required: [true, 'Bill ID reference is required']
    },
    pdfUrl: {
      type: String,
      trim: true
    },
    invoiceStatus: {
      type: String,
      enum: {
        values: ['generated', 'cancelled'],
        message: '{VALUE} is not a valid invoice status'
      },
      default: 'generated'
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Generating User reference is required']
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    collection: 'invoices'
  }
);

// Indexes
InvoiceSchema.index({ billId: 1 });
InvoiceSchema.index({ createdAt: -1 });

const Invoice = mongoose.model('Invoice', InvoiceSchema);

export default Invoice;
