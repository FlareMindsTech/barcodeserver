/**
 * @file Barcode.js
 * @description Mongoose model for generated product barcodes.
 * 
 * @relationship
 * - Barcode (Many) -> Product (1) via `productId`
 * - Barcode (Many) -> User (1) via `generatedBy`
 * 
 * @indexes
 * - Single-field index on `barcodeNumber` (Unique, ascending) for rapid identification.
 * - Single-field index on `productId` for retrieving all barcodes associated with a product.
 * 
 * @validation
 * - productId: Required, Schema.Types.ObjectId.
 * - barcodeNumber: Required, unique, trimmed.
 * - barcodeType: Required, enum ['EAN13', 'CODE128', 'QR'].
 * - generatedBy: Required, Schema.Types.ObjectId.
 * 
 * @example
 * {
 *   "productId": "60d0fe4f5311236168a109cf",
 *   "barcodeNumber": "FMT89012345",
 *   "barcodeType": "CODE128",
 *   "generatedBy": "60d0fe4f5311236168a109c9",
 *   "generatedDate": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const BarcodeSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID reference is required']
    },
    barcodeNumber: {
      type: String,
      required: [true, 'Barcode number is required'],
      unique: true,
      trim: true,
      minlength: [4, 'Barcode must be at least 4 characters long'],
      maxlength: [100, 'Barcode cannot exceed 100 characters']
    },
    barcodeType: {
      type: String,
      enum: {
        values: ['EAN13', 'CODE128', 'QR'],
        message: '{VALUE} is not a valid barcode type'
      },
      default: 'CODE128'
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Generating User reference is required']
    },
    generatedDate: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'barcodes'
  }
);

// Indexes
BarcodeSchema.index({ productId: 1 });

const Barcode = mongoose.model('Barcode', BarcodeSchema);

export default Barcode;
