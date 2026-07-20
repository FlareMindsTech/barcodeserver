/**
 * @file Refund.js
 * @description Mongoose model for financial refunds mapped to approved product returns.
 * 
 * @relationship
 * - Refund (Many) -> Return (1) via `returnId`
 * 
 * @indexes
 * - Single-field index on `returnId` for identifying refunds of a specific return request.
 * - Single-field index on `status` to monitor processing status.
 * - Single-field index on `processedAt` for accounting journals.
 * 
 * @validation
 * - returnId: Required, Schema.Types.ObjectId.
 * - refundMethod: Required, enum ['cash', 'card', 'upi', 'store_credit'].
 * - amount: Required, min: 0.
 * - transactionId: Optional, trimmed string.
 * - status: Required, enum ['pending', 'completed', 'failed'].
 * 
 * @example
 * {
 *   "returnId": "60d0fe4f5311236168a109d6",
 *   "refundMethod": "upi",
 *   "amount": 499.50,
 *   "transactionId": "TXN9876543210",
 *   "status": "completed",
 *   "processedAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const RefundSchema = new Schema(
  {
    returnId: {
      type: Schema.Types.ObjectId,
      ref: 'Return',
      required: [true, 'Return ID reference is required']
    },
    refundMethod: {
      type: String,
      enum: {
        values: ['cash', 'card', 'upi', 'store_credit'],
        message: '{VALUE} is not a valid refund method'
      },
      required: [true, 'Refund method is required']
    },
    amount: {
      type: Number,
      required: [true, 'Refund amount is required'],
      min: [0, 'Refund amount cannot be negative']
    },
    transactionId: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'completed', 'failed'],
        message: '{VALUE} is not a valid refund status'
      },
      default: 'pending'
    },
    processedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'refunds'
  }
);

// Indexes
RefundSchema.index({ returnId: 1 });
RefundSchema.index({ status: 1 });
RefundSchema.index({ processedAt: -1 });

const Refund = mongoose.model('Refund', RefundSchema);

export default Refund;
