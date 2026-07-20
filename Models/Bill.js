/**
 * @file Bill.js
 * @description Mongoose model representing sales receipt and billing metadata.
 * 
 * @relationship
 * - Bill (Many) -> Customer (1) via `customerId` (Optional for guest checkouts)
 * - Bill (Many) -> User (1) via `userId` (Cashier/Biller reference)
 * - Bill (1) <-> BillItem (Many)
 * 
 * @indexes
 * - Single-field index on `billNumber` (Unique, ascending) for rapid searches.
 * - Single-field index on `customerId` for customer purchase history retrieval.
 * - Single-field index on `userId` to run cashier sales performance analytics.
 * - Single-field index on `createdAt` (Descending) for chronologically sorted reporting.
 * 
 * @validation
 * - billNumber: Required, unique, trimmed.
 * - customerId: Optional, Schema.Types.ObjectId.
 * - userId: Required, Schema.Types.ObjectId.
 * - subtotal: Required, min: 0.
 * - gstAmount: Required, min: 0, default: 0.
 * - discountAmount: Required, min: 0, default: 0.
 * - grandTotal: Required, min: 0, must be mathematically consistent with (subtotal + gstAmount - discountAmount).
 * - paymentMethod: Required, enum ['cash', 'card', 'upi', 'credit', 'split'].
 * - paymentStatus: Required, enum ['paid', 'unpaid', 'partially_paid'].
 * 
 * @example
 * {
 *   "billNumber": "BILL-2026-0001",
 *   "customerId": "60d0fe4f5311236168a109d2",
 *   "userId": "60d0fe4f5311236168a109c9",
 *   "subtotal": 1000.00,
 *   "gstAmount": 180.00,
 *   "discountAmount": 100.00,
 *   "grandTotal": 1080.00,
 *   "paymentMethod": "upi",
 *   "paymentStatus": "paid",
 *   "createdAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const BillSchema = new Schema(
  {
    billNumber: {
      type: String,
      required: [true, 'Bill number is required'],
      unique: true,
      trim: true
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      default: null // Null represents guest/walk-in customer
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Billing User reference is required']
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal amount is required'],
      min: [0, 'Subtotal cannot be negative']
    },
    gstAmount: {
      type: Number,
      required: [true, 'GST amount is required'],
      min: [0, 'GST amount cannot be negative'],
      default: 0
    },
    discountAmount: {
      type: Number,
      required: [true, 'Discount amount is required'],
      min: [0, 'Discount amount cannot be negative'],
      default: 0
    },
    grandTotal: {
      type: Number,
      required: [true, 'Grand total is required'],
      min: [0, 'Grand total cannot be negative'],
      validate: {
        validator: function (v) {
          const expectedTotal = this.subtotal + this.gstAmount - this.discountAmount;
          // Allowing 0.05 margin for rounding errors
          return Math.abs(v - expectedTotal) <= 0.05;
        },
        message: 'Grand total ({VALUE}) must equal (subtotal + gstAmount - discountAmount)'
      }
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['cash', 'card', 'upi', 'credit', 'split'],
        message: '{VALUE} is not a valid payment method'
      },
      required: [true, 'Payment method is required']
    },
    paymentStatus: {
      type: String,
      enum: {
        values: ['paid', 'unpaid', 'partially_paid'],
        message: '{VALUE} is not a valid payment status'
      },
      default: 'paid'
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    collection: 'bills'
  }
);

// Indexes
BillSchema.index({ customerId: 1 });
BillSchema.index({ userId: 1 });
BillSchema.index({ createdAt: -1 });

const Bill = mongoose.model('Bill', BillSchema);

export default Bill;
