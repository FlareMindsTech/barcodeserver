/**
 * @file StockTransfer.js
 * @description Mongoose model for tracking stock relocation from one facility/location to another.
 * 
 * @relationship
 * - StockTransfer (Many) -> Product (1) via `productId`
 * - StockTransfer (Many) -> User (1) via `transferredBy`
 * 
 * @indexes
 * - Single-field index on `productId` to retrieve transfer logs for specific items.
 * - Single-field index on `status` to filter active (pending) vs. historic transfers.
 * - Compound index on `fromLocation` and `toLocation` for tracking logistics pathways.
 * 
 * @validation
 * - productId: Required, Schema.Types.ObjectId.
 * - fromLocation: Required, trimmed string.
 * - toLocation: Required, trimmed string.
 * - quantity: Required, min: 1.
 * - status: Required, enum ['pending', 'completed', 'cancelled'].
 * - transferredBy: Required, Schema.Types.ObjectId.
 * 
 * @example
 * {
 *   "productId": "60d0fe4f5311236168a109cf",
 *   "fromLocation": "Main Warehouse",
 *   "toLocation": "Downtown Outlet",
 *   "quantity": 100,
 *   "status": "pending",
 *   "transferDate": "2026-07-16T12:00:00.000Z",
 *   "transferredBy": "60d0fe4f5311236168a109c9",
 *   "remarks": "Inter-branch weekly replenishment."
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const StockTransferSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID reference is required']
    },
    fromLocation: {
      type: String,
      required: [true, 'Origin location (fromLocation) is required'],
      trim: true
    },
    toLocation: {
      type: String,
      required: [true, 'Destination location (toLocation) is required'],
      trim: true,
      validate: {
        validator: function (value) {
          // Prevent transferring to the same location
          return this.fromLocation !== value;
        },
        message: 'Destination location cannot be the same as the origin location'
      }
    },
    quantity: {
      type: Number,
      required: [true, 'Transfer quantity is required'],
      min: [1, 'Quantity must be at least 1 unit']
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'completed', 'cancelled'],
        message: '{VALUE} is not a valid transfer status'
      },
      default: 'pending'
    },
    transferDate: {
      type: Date,
      default: Date.now
    },
    transferredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Transferred by User reference is required']
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, 'Remarks cannot exceed 500 characters']
    }
  },
  {
    collection: 'stock_transfers'
  }
);

// Indexes
StockTransferSchema.index({ productId: 1 });
StockTransferSchema.index({ status: 1 });
StockTransferSchema.index({ fromLocation: 1, toLocation: 1 });

const StockTransfer = mongoose.model('StockTransfer', StockTransferSchema);

export default StockTransfer;
