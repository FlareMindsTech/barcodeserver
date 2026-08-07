/**
 * @file OnlineInventory.js
 * @description Mongoose model for online-store stock levels, credited when
 * stock is dispatched from the factory (Factory → Online transfer).
 *
 * @relationship
 * - OnlineInventory (1) -> Product (1) via `productId`
 *
 * @example
 * {
 *   "productId": "60d0fe4f5311236168a109cf",
 *   "quantity": 25,
 *   "minimumStock": 5,
 *   "stockStatus": "in_stock",
 *   "lastUpdated": "2026-08-07T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const OnlineInventorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID reference is required'],
      unique: true
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
      default: 5
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
    collection: 'online_inventories'
  }
);

// Indexes
OnlineInventorySchema.index({ stockStatus: 1 });

// Pre-save hook: Compute stock status and update lastUpdated timestamp
OnlineInventorySchema.pre('save', function () {
  this.lastUpdated = new Date();

  if (this.quantity <= 0) {
    this.stockStatus = 'out_of_stock';
  } else if (this.quantity <= this.minimumStock) {
    this.stockStatus = 'low_stock';
  } else {
    this.stockStatus = 'in_stock';
  }
});

// Static method to update online stock quantity atomically ($inc upsert)
OnlineInventorySchema.statics.adjustStock = function (productId, delta, options = {}) {
  return this.findOneAndUpdate(
    { productId },
    { $inc: { quantity: delta } },
    { new: true, upsert: true, runValidators: true, session: options.session || null }
  );
};

// Static method to deduct online stock ONLY if enough is available.
// Returns the updated document or null when unavailable.
OnlineInventorySchema.statics.deductStock = function (productId, quantity, options = {}) {
  return this.findOneAndUpdate(
    { productId, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
    { new: true, upsert: false, runValidators: true, session: options.session || null }
  );
};

const OnlineInventory = mongoose.model('OnlineInventory', OnlineInventorySchema);

export default OnlineInventory;