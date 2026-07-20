/**
 * @file BillItem.js
 * @description Mongoose model for individual items (line items) associated with a Bill receipt.
 * 
 * @relationship
 * - BillItem (Many) -> Bill (1) via `billId`
 * - BillItem (Many) -> Product (1) via `productId`
 * 
 * @indexes
 * - Single-field index on `billId` (Ascending) for quick line item loading.
 * - Single-field index on `productId` for product-specific sales volume reporting.
 * - Compound index on `billId` and `productId` to speed up operations involving checking specific items in a bill.
 * 
 * @validation
 * - billId: Required, Schema.Types.ObjectId.
 * - productId: Required, Schema.Types.ObjectId.
 * - quantity: Required, min: 1.
 * - price: Required, min: 0 (Unit Price).
 * - gst: Required, min: 0, max: 100 (GST percentage applied).
 * - discount: Optional, min: 0 (Discount amount applied to this item line).
 * - total: Required, min: 0, matches mathematically: (price * quantity - discount) * (1 + gst / 100).
 * 
 * @example
 * {
 *   "billId": "60d0fe4f5311236168a109d3",
 *   "productId": "60d0fe4f5311236168a109cf",
 *   "quantity": 2,
 *   "price": 500.00,
 *   "gst": 5.00,
 *   "discount": 50.00,
 *   "total": 997.50
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const BillItemSchema = new Schema(
  {
    billId: {
      type: Schema.Types.ObjectId,
      ref: 'Bill',
      required: [true, 'Bill ID reference is required']
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID reference is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    },
    gst: {
      type: Number,
      required: [true, 'GST percentage is required'],
      min: [0, 'GST percentage cannot be less than 0%'],
      max: [100, 'GST percentage cannot exceed 100%'],
      default: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    total: {
      type: Number,
      required: [true, 'Line item total amount is required'],
      min: [0, 'Total cannot be negative'],
      validate: {
        validator: function (v) {
          const taxableAmount = (this.price * this.quantity) - this.discount;
          const gstAmount = taxableAmount * (this.gst / 100);
          const expectedTotal = taxableAmount + gstAmount;
          // Allowing 0.05 margin for rounding errors
          return Math.abs(v - expectedTotal) <= 0.05;
        },
        message: 'Total ({VALUE}) must equal ((price * quantity - discount) + gstAmount)'
      }
    }
  },
  {
    collection: 'bill_items'
  }
);

// Indexes
BillItemSchema.index({ billId: 1 });
BillItemSchema.index({ productId: 1 });
BillItemSchema.index({ billId: 1, productId: 1 });

const BillItem = mongoose.model('BillItem', BillItemSchema);

export default BillItem;
