/**
 * @file Brand.js
 * @description Mongoose model for product brands.
 * 
 * @relationship
 * - Brand (1) <-> Product (Many)
 * 
 * @indexes
 * - Single-field index on `brandName` (Unique, ascending) for rapid searches.
 * - Single-field index on `isDeleted` for filtering active brands.
 * 
 * @validation
 * - brandName: Required, unique, trimmed, minlength 2, maxlength 100.
 * - description: Trimmed string.
 * - status: Required, enum ['active', 'inactive'].
 * 
 * @example
 * {
 *   "brandName": "FlareMinds Jeans",
 *   "description": "Premium quality denim brand.",
 *   "status": "active",
 *   "isDeleted": false,
 *   "createdAt": "2026-07-16T12:00:00.000Z",
 *   "updatedAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const BrandSchema = new Schema(
  {
    brandName: {
      type: String,
      required: [true, 'Brand name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Brand name must be at least 2 characters long'],
      maxlength: [100, 'Brand name cannot exceed 100 characters']
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: '{VALUE} is not a valid brand status'
      },
      default: 'active'
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'brands'
  }
);

// Query Middleware: Exclude soft-deleted brands by default
BrandSchema.pre(/^find/, function () {
  this.where({ isDeleted: { $ne: true } });
});

// Instance Method: Soft delete
BrandSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.brandName = `${this.brandName}_deleted_${this._id}`;
  return this.save({ validateBeforeSave: false });
};

const Brand = mongoose.model('Brand', BrandSchema);

export default Brand;
