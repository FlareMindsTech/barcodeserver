/**
 * @file Category.js
 * @description Mongoose model for product categories (e.g., Shirts, Trousers, Fabrics).
 * 
 * @relationship
 * - Category (1) <-> Product (Many)
 * 
 * @indexes
 * - Single-field index on `categoryName` (Unique, ascending) for rapid searches.
 * - Single-field index on `isDeleted` for filtering active categories.
 * 
 * @validation
 * - categoryName: Required, unique, trimmed, minlength 2, maxlength 100.
 * - description: Trimmed string.
 * - status: Required, enum ['active', 'inactive'].
 * 
 * @example
 * {
 *   "categoryName": "Cotton Shirts",
 *   "status": "active",
 *   "isDeleted": false,
 *   "createdAt": "2026-07-16T12:00:00.000Z",
 *   "updatedAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const CategorySchema = new Schema(
  {
    categoryName: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters long'],
      maxlength: [100, 'Category name cannot exceed 100 characters']
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: '{VALUE} is not a valid category status'
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
    collection: 'categories'
  }
);

// Query Middleware: Exclude soft-deleted categories by default
CategorySchema.pre(/^find/, function () {
  this.where({ isDeleted: { $ne: true } });
});

// Instance Method: Soft delete
CategorySchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.categoryName = `${this.categoryName}_deleted_${this._id}`;
  return this.save({ validateBeforeSave: false });
};

const Category = mongoose.model('Category', CategorySchema);

export default Category;
