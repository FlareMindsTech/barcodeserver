/**
 * @file FactoryInventory.js
 * @description Mongoose model for tracking product stock movements inside the warehouse/factory.
 * 
 * @relationship
 * - FactoryInventory (Many) -> Product (1) via `productId`
 * 
 * @indexes
 * - Single-field index on `productId` to speed up stock history retrieval per product.
 * - Single-field index on `movementType` for stock flow analytics.
 * - Compound index on `productId` and `lastUpdated` for sorted historical query optimization.
 * 
 * @validation
 * - productId: Required, Schema.Types.ObjectId.
 * - quantity: Required, number (can be positive or negative depending on movement type, but usually positive indicating volume of transaction).
 * - movementType: Required, enum ['inward', 'outward', 'adjustment'].
 * - remarks: Optional, trimmed string.
 * 
 * @example
 * {
 *   "productId": "60d0fe4f5311236168a109cf",
 *   "quantity": 500,
 *   "movementType": "inward",
 *   "remarks": "Received batch from production unit A.",
 *   "lastUpdated": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const FactoryInventorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID reference is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      default: 0
    },
    movementType: {
      type: String,
      enum: {
        values: ['inward', 'outward', 'adjustment'],
        message: '{VALUE} is not a valid movement type'
      },
      required: [true, 'Movement type is required']
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, 'Remarks cannot exceed 500 characters']
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'factory_inventories'
  }
);

// Indexes
FactoryInventorySchema.index({ productId: 1 });
FactoryInventorySchema.index({ movementType: 1 });
FactoryInventorySchema.index({ productId: 1, lastUpdated: -1 });

// Pre-save hook: Automatically update the lastUpdated timestamp
FactoryInventorySchema.pre('save', function () {
  this.lastUpdated = new Date();
});

const FactoryInventory = mongoose.model('FactoryInventory', FactoryInventorySchema);

export default FactoryInventory;
