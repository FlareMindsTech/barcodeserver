/**
 * @file Return.js
 * @description Mongoose model for product return transactions.
 * 
 * @relationship
 * - Return (Many) -> Invoice (1) via `invoiceId`
 * - Return (Many) -> Product (1) via `productId`
 * - Return (Many) -> User (1) via `approvedBy` (Optional pending approval)
 * 
 * @indexes
 * - Single-field index on `invoiceId` to see returns against a purchase invoice.
 * - Single-field index on `productId` to monitor high-defect or high-return products.
 * - Single-field index on `status` to filter pending return requests.
 * 
 * @validation
 * - invoiceId: Required, Schema.Types.ObjectId.
 * - productId: Required, Schema.Types.ObjectId.
 * - quantity: Required, min: 1.
 * - refundAmount: Required, min: 0.
 * - returnReason: Required, trimmed string.
 * - status: Required, enum ['pending', 'approved', 'rejected'].
 * 
 * @example
 * {
 *   "invoiceId": "60d0fe4f5311236168a109d4",
 *   "productId": "60d0fe4f5311236168a109cf",
 *   "quantity": 1,
 *   "refundAmount": 499.50,
 *   "returnReason": "Wrong size, requested exchange or refund.",
 *   "status": "pending",
 *   "createdAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const ReturnSchema = new Schema(
  {
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      required: [true, 'Invoice ID reference is required']
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID reference is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Return quantity is required'],
      min: [1, 'Quantity must be at least 1 unit']
    },
    refundAmount: {
      type: Number,
      required: [true, 'Refund amount is required'],
      min: [0, 'Refund amount cannot be negative']
    },
    returnReason: {
      type: String,
      required: [true, 'Reason for return is required'],
      trim: true,
      maxlength: [500, 'Return reason cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected', 'refunded', 'exchanged'],
        message: '{VALUE} is not a valid return status'
      },
      default: 'pending'
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null // Will be updated when status is set to approved or rejected
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    collection: 'returns'
  }
);

// Indexes
ReturnSchema.index({ invoiceId: 1 });
ReturnSchema.index({ productId: 1 });
ReturnSchema.index({ status: 1 });
ReturnSchema.index({ createdAt: -1 });

const Return = mongoose.model('Return', ReturnSchema);

export default Return;
