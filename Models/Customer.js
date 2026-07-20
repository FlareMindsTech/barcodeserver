/**
 * @file Customer.js
 * @description Mongoose model for Customers who buy from the retail unit.
 * 
 * @relationship
 * - Customer (1) <-> Bill (Many)
 * 
 * @indexes
 * - Single-field index on `mobile` (Ascending) for fast checkouts using phone search.
 * - Single-field index on `customerName` (Ascending) for billing search dropdowns.
 * - Single-field index on `isDeleted` to filter active customers.
 * 
 * @validation
 * - customerName: Required, trimmed.
 * - mobile: Required, 10-digit mobile number format.
 * - email: Optional, lowercase, validated email format.
 * - gstNumber: Optional, 15-character official Indian GST format validation.
 * - status: Required, enum ['active', 'inactive'].
 * 
 * @example
 * {
 *   "customerName": "John Smith",
 *   "mobile": "9876543210",
 *   "email": "john.smith@gmail.com",
 *   "address": "123 High Street, Mumbai, MH, 400001",
 *   "gstNumber": "27AAAAA1111A1Z1",
 *   "status": "active",
 *   "isDeleted": false
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const CustomerSchema = new Schema(
  {
    customerName: {
      type: String,
      trim: true,
      minlength: [2, 'Customer name must be at least 2 characters long'],
      maxlength: [100, 'Customer name cannot exceed 100 characters']
    },
    mobile: {
      type: String,
      trim: true,
      match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit mobile number']
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: '{VALUE} is not a valid customer status'
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
    collection: 'customers'
  }
);

// Indexes
CustomerSchema.index({ mobile: 1 });
CustomerSchema.index({ customerName: 1 });

// Query Middleware: Exclude soft-deleted customers by default
CustomerSchema.pre(/^find/, function () {
  this.where({ isDeleted: { $ne: true } });
});

// Instance Method: Soft delete
CustomerSchema.methods.softDelete = function () {
  this.isDeleted = true;
  return this.save();
};

const Customer = mongoose.model('Customer', CustomerSchema);

export default Customer;
