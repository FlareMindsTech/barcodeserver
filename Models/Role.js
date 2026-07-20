/**
 * @file Role.js
 * @description Mongoose model for User Roles and permissions.
 * 
 * @relationship
 * - Role (1) <-> User (Many)
 * 
 * @indexes
 * - Single-field index on `roleName` (Unique, ascending) for fast authorization checks.
 * - Single-field index on `isDeleted` for filtering active roles.
 * 
 * @validation
 * - roleName: Required, unique, trimmed, automatically converted to uppercase.
 * - permissions: Array of strings.
 * - description: Trimmed string.
 * 
 * @example
 * {
 *   "roleName": "ADMIN",
 *   "permissions": ["CREATE_PRODUCT", "VIEW_BILL", "MANAGE_USERS"],
 *   "description": "Administrator role with full backend privileges.",
 *   "isDeleted": false,
 *   "createdAt": "2026-07-16T12:00:00.000Z",
 *   "updatedAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const RoleSchema = new Schema(
  {
    roleName: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [2, 'Role name must be at least 2 characters'],
      maxlength: [50, 'Role name cannot exceed 50 characters']
    },
    permissions: {
      type: [String],
      default: []
    },
    description: {
      type: String,
      trim: true,
      maxlength: [250, 'Description cannot exceed 250 characters']
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true, // Enables createdAt and updatedAt
    collection: 'roles'
  }
);

// Query Middleware to exclude soft-deleted records by default
RoleSchema.pre(/^find/, function () {
  this.where({ isDeleted: { $ne: true } });
});

// Static method to restore a soft-deleted role
RoleSchema.statics.restore = function (id) {
  return this.findByIdAndUpdate(id, { isDeleted: false }, { new: true });
};

// Instance method for soft delete
RoleSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.roleName = `${this.roleName}_deleted_${this._id}`;
  return this.save({ validateBeforeSave: false });
};

const Role = mongoose.model('Role', RoleSchema);

export default Role;
