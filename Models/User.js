/**
 * @file User.js
 * @description Mongoose model for User accounts with bcrypt hashing.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [50, 'Username cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address'
      ]
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [
        /^\+?[1-9]\d{9,14}$/,
        'Please enter a valid phone number'
      ]
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false // Excluded from queries by default
    },
    role: {
      type: String,
      enum: {
        values: ['ADMIN', 'STOCK_MANAGER', 'STAFF'],
        message: '{VALUE} is not a valid user role'
      },
      required: [true, 'Role is required']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

// Indexes
// Unique indexes on username, email, and phoneNumber are created automatically via unique: true in schema definition.

// Pre-save hook: Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance Method: Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Query Middleware: Exclude soft-deleted users
UserSchema.pre(/^find/, function () {
  this.where({ isDeleted: { $ne: true } });
});

// Soft delete instance method
UserSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.username = `${this.username}_deleted_${this._id}`;
  this.email = `${this.email}_deleted_${this._id}`;
  this.phoneNumber = `${this.phoneNumber}_deleted_${this._id}`;
  return this.save({ validateBeforeSave: false });
};

// Map virtual id to _id
UserSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

UserSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.password; // Double check it doesn't get sent out
    delete ret.name;     // Remove legacy name field from responses
    return ret;
  }
});

UserSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', UserSchema);

export default User;
