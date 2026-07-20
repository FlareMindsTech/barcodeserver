/**
 * @file Sale.js
 * @description Mongoose model representing accounting/ledger records of closed sales transactions.
 * 
 * @relationship
 * - Sale (1) -> Bill (1) via `billId`
 * - Sale (1) -> Invoice (1) via `invoiceId`
 * - Sale (Many) -> Customer (1) via `customerId` (Optional)
 * 
 * @indexes
 * - Single-field index on `billId` (Unique, ascending) for direct receipt mappings.
 * - Single-field index on `invoiceId` for invoice mappings.
 * - Single-field index on `customerId` for customer loyalty tracking.
 * - Single-field index on `saleDate` (Descending) for date-range analytical queries.
 * 
 * @validation
 * - billId: Required, unique, Schema.Types.ObjectId.
 * - invoiceId: Optional, Schema.Types.ObjectId.
 * - customerId: Optional, Schema.Types.ObjectId.
 * - totalAmount: Required, min: 0.
 * - paymentMethod: Required, string.
 * 
 * @example
 * {
 *   "billId": "60d0fe4f5311236168a109d3",
 *   "invoiceId": "60d0fe4f5311236168a109d4",
 *   "customerId": "60d0fe4f5311236168a109d2",
 *   "totalAmount": 1080.00,
 *   "paymentMethod": "upi",
 *   "saleDate": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const SaleSchema = new Schema(
  {
    billId: {
      type: Schema.Types.ObjectId,
      ref: 'Bill',
      required: [true, 'Bill ID reference is required'],
      unique: true // A sale is linked to exactly one bill
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total sale amount is required'],
      min: [0, 'Total amount cannot be negative']
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      trim: true
    },
    saleDate: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    collection: 'sales'
  }
);

// Indexes
SaleSchema.index({ invoiceId: 1 });
SaleSchema.index({ customerId: 1 });
SaleSchema.index({ saleDate: -1 });

const Sale = mongoose.model('Sale', SaleSchema);

export default Sale;
