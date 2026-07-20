/**
 * @file RetailStockMovement.js
 * @description Mongoose model for tracking retail shop stock transaction history.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const RetailStockMovementSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required']
    },
    movementType: {
      type: String,
      enum: {
        values: ['received', 'sale', 'return', 'adjustment', 'damage'],
        message: '{VALUE} is not a valid retail movement type'
      },
      required: [true, 'Movement type is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required']
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, 'Remarks cannot exceed 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'retail_stock_movements'
  }
);

// Indexes for query speed
RetailStockMovementSchema.index({ productId: 1 });
RetailStockMovementSchema.index({ createdAt: -1 });

const RetailStockMovement = mongoose.model('RetailStockMovement', RetailStockMovementSchema);

export default RetailStockMovement;
