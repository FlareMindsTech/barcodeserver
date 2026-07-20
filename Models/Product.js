/**
 * @file Product.js
 * @description Mongoose model representing Textile products for Product Management.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    productId: {
      type: String,
      unique: true,
      index: true
    },
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters long'],
      maxlength: [200, 'Product name cannot exceed 200 characters']
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category reference is required'],
      index: true
    },
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      required: [true, 'Brand reference is required'],
      index: true
    },
    size: {
      type: String,
      required: [true, 'Size is required'],
      enum: {
        values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        message: '{VALUE} is not a valid size'
      },
      trim: true
    },
    color: {
      type: String,
      required: [true, 'Color is required'],
      trim: true,
      maxlength: [50, 'Color description cannot exceed 50 characters']
    },
    barcode: {
      type: String,
      unique: true,
      required: [true, 'Barcode is required'],
      trim: true,
      index: true
    },
    mrp: {
      type: Number,
      required: [true, 'Maximum Retail Price (MRP) is required'],
      min: [0.01, 'MRP must be greater than 0']
    },
    gst: {
      type: Number,
      required: [true, 'GST percentage is required'],
      min: [0, 'GST percentage cannot be negative'],
      default: 0
    },
    discount: {
      type: Number,
      required: [true, 'Discount percentage is required'],
      min: [0, 'Discount percentage cannot be negative'],
      max: [100, 'Discount percentage cannot exceed 100'],
      default: 0
    },
    images: {
      type: [
        {
          imageUrl: { type: String, required: true },
          displayOrder: { type: Number, default: 0 },
          isPrimary: { type: Boolean, default: false }
        }
      ],
      default: []
    },
    stockStatus: {
      type: String,
      enum: {
        values: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED'],
        message: '{VALUE} is not a valid stock status'
      },
      default: 'OUT_OF_STOCK'
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE'],
        message: '{VALUE} is not a valid product status'
      },
      default: 'ACTIVE'
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    // Optional compatibility fields
    costPrice: {
      type: Number,
      min: 0
    },
    sellingPrice: {
      type: Number,
      min: 0
    }
  },
  {
    timestamps: true,
    collection: 'products'
  }
);

// Indexes
ProductSchema.index({ categoryId: 1, brandId: 1 });
ProductSchema.index({ productName: 'text' }); // Full-text search for product names

// Pre-save hook: Generate productId if not present
ProductSchema.pre('save', async function () {
  if (this.isNew && !this.productId) {
    const count = await mongoose.model('Product').estimatedDocumentCount();
    this.productId = `PRD${String(count + 1).padStart(3, '0')}`;
  }
});

// Enable virtual fields when converting to JSON or Object
ProductSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret.productId || ret._id.toString();
    delete ret.__v;
    return ret;
  }
});
ProductSchema.set('toObject', { virtuals: true });

// Query Middleware: Filter out deleted products
ProductSchema.pre(/^find/, function () {
  this.where({ isDeleted: { $ne: true } });
});

// Instance Method: Soft delete
ProductSchema.methods.softDelete = function () {
  this.status = 'INACTIVE';
  this.isDeleted = true;
  this.productId = `${this.productId}_deleted_${this._id}`;
  this.barcode = `${this.barcode}_deleted_${this._id}`;
  return this.save({ validateBeforeSave: false });
};

const Product = mongoose.model('Product', ProductSchema);

export default Product;
