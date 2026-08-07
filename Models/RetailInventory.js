/**
 * @file RetailInventory.js
 * @description Mongoose model for store-front retail stock levels and low-stock indicators.
 * 
 * @relationship
 * - RetailInventory (1) -> Product (1) via `productId`
 * 
 * @indexes
 * - Single-field index on `productId` (Unique) to ensure one inventory record per product.
 * - Single-field index on `stockStatus` for fast low-stock queries.
 * 
 * @validation
 * - productId: Required, unique, Schema.Types.ObjectId.
 * - quantity: Required, min: 0, default: 0.
 * - minimumStock: Required, min: 0, default: 10.
 * - stockStatus: Enum ['in_stock', 'low_stock', 'out_of_stock'], automatically managed via pre-save.
 * 
 * @example
 * {
 *   "productId": "60d0fe4f5311236168a109cf",
 *   "quantity": 8,
 *   "minimumStock": 15,
 *   "stockStatus": "low_stock",
 *   "lastUpdated": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const RetailInventorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID reference is required'],
      unique: true // Each product has exactly one inventory entry
    },
    quantity: {
      type: Number,
      required: [true, 'Inventory quantity is required'],
      min: [0, 'Quantity cannot be negative'],
      default: 0
    },
    minimumStock: {
      type: Number,
      required: [true, 'Minimum stock threshold is required'],
      min: [0, 'Minimum stock threshold cannot be negative'],
      default: 10
    },
    stockStatus: {
      type: String,
      enum: {
        values: ['in_stock', 'low_stock', 'out_of_stock'],
        message: '{VALUE} is not a valid stock status'
      },
      default: 'out_of_stock'
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'retail_inventories'
  }
);

// Indexes
RetailInventorySchema.index({ stockStatus: 1 });

// Pre-save hook: Compute stock status and update lastUpdated timestamp
RetailInventorySchema.pre('save', function () {
  this.lastUpdated = new Date();
  
  if (this.quantity <= 0) {
    this.stockStatus = 'out_of_stock';
  } else if (this.quantity <= this.minimumStock) {
    this.stockStatus = 'low_stock';
  } else {
    this.stockStatus = 'in_stock';
  }
});

// Static method to update product stock quantity
RetailInventorySchema.statics.adjustStock = function (productId, delta) {
  return this.findOneAndUpdate(
    { productId },
    { $inc: { quantity: delta } },
    { new: true, upsert: true, runValidators: true }
  );
};

const RetailInventory = mongoose.model('RetailInventory', RetailInventorySchema);

export default RetailInventory;
