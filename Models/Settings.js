/**
 * @file Settings.js
 * @description Mongoose model for store settings and application configurations.
 * 
 * @relationship
 * - Settings (Many) -> User (1) via `updatedBy`
 * 
 * @indexes
 * - Since this collection usually contains only a single configuration document,
 *   no large indexing strategy is needed, but we index `updatedBy` for tracing modifications.
 * 
 * @validation
 * - shopName: Required, trimmed.
 * - shopAddress: Required, trimmed.
 * - gstNumber: Optional, 15-character official Indian GST format validation.
 * - gstPercentage: Required, range 0-100 (defaults to 18).
 * - defaultDiscount: Required, min: 0 (defaults to 0).
 * - invoicePrefix: Required, trimmed string (defaults to 'INV-').
 * - currency: Required, default 'INR'.
 * - contactNumber: Optional, trimmed.
 * - updatedBy: Schema.Types.ObjectId.
 * 
 * @example
 * {
 *   "shopName": "FlareMinds Apparel Outlet",
 *   "shopAddress": "Plot 45, Textile Hub, Surat, Gujarat, 395003",
 *   "gstNumber": "24ABCDE1234F1Z5",
 *   "gstPercentage": 5,
 *   "defaultDiscount": 0,
 *   "invoicePrefix": "FM-INV-",
 *   "currency": "INR",
 *   "contactNumber": "+919876543210",
 *   "updatedBy": "60d0fe4f5311236168a109c9"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const SettingsSchema = new Schema(
  {
    shopName: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
      maxlength: [150, 'Shop name cannot exceed 150 characters']
    },
    shopAddress: {
      type: String,
      required: [true, 'Shop address is required'],
      trim: true,
      maxlength: [500, 'Shop address cannot exceed 500 characters']
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        'Please enter a valid 15-character GSTIN number (e.g. 24ABCDE1234F1Z5)'
      ]
    },
    gstPercentage: {
      type: Number,
      required: [true, 'Default GST percentage is required'],
      min: [0, 'GST percentage cannot be less than 0%'],
      max: [100, 'GST percentage cannot exceed 100%'],
      default: 18
    },
    defaultDiscount: {
      type: Number,
      required: [true, 'Default discount value is required'],
      min: [0, 'Discount value cannot be negative'],
      default: 0
    },
    invoicePrefix: {
      type: String,
      required: [true, 'Invoice prefix is required'],
      trim: true,
      default: 'INV-',
      maxlength: [10, 'Invoice prefix cannot exceed 10 characters']
    },
    currency: {
      type: String,
      required: [true, 'Currency type is required'],
      trim: true,
      default: 'INR',
      maxlength: [10, 'Currency format cannot exceed 10 characters']
    },
    contactNumber: {
      type: String,
      trim: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'settings'
  }
);

const Settings = mongoose.model('Settings', SettingsSchema);

export default Settings;
