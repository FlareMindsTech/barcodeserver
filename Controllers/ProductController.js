/**
 * @file ProductController.js
 * @description Controller for Product operations.
 */

import mongoose from 'mongoose';
import Product from '../Models/Product.js';
import Brand from '../Models/Brand.js';
import Category from '../Models/Category.js';
import Barcode from '../Models/Barcode.js';
import Settings from '../Models/Settings.js';
import { validateProductCreation, validateProductUpdate } from '../Helpers/ProductValidation.js';
import { generateUniqueBarcode } from '../Helpers/BarcodeGenerator.js';
import { uploadToCloudinary } from '../Helpers/CloudinaryService.js';

/**
 * Add Product
 */
export const createProduct = async (req, res, next) => {
  try {
    // 1. Validate request body
    const validation = validateProductCreation(req.body);
    if (!validation.status) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: [validation.message]
      });
    }

    const { productName, brandId, categoryId, size, color, mrp, gst, discount } = req.body;

    // Fetch defaults from settings if not provided
    let finalGst = gst;
    let finalDiscount = discount;
    if (gst === undefined || gst === null || discount === undefined || discount === null) {
      const settings = await Settings.findOne();
      if (gst === undefined || gst === null) {
        finalGst = settings ? settings.gstPercentage : 18;
      }
      if (discount === undefined || discount === null) {
        finalDiscount = settings ? settings.defaultDiscount : 0;
      }
    }

    // 2. Validate Brand
    if (!mongoose.Types.ObjectId.isValid(brandId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid brand ID.'
      });
    }
    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.'
      });
    }

    // 3. Validate Category
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID.'
      });
    }
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.'
      });
    }

    // 4. Check duplicate product
    const cleanName = productName.trim();
    const cleanColor = color.trim();
    const cleanSize = size.toUpperCase().trim();

    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${cleanName}$`, 'i') },
      brandId,
      categoryId,
      size: cleanSize,
      color: { $regex: new RegExp(`^${cleanColor}$`, 'i') }
    });

    if (existingProduct) {
      return res.status(409).json({
        success: false,
        message: 'Product already exists.'
      });
    }

    // 5. Generate barcode
    const barcode = await generateUniqueBarcode();

    // 6. Save product
    const product = new Product({
      productName: cleanName,
      brandId,
      categoryId,
      size: cleanSize,
      color: cleanColor,
      barcode,
      mrp,
      gst: finalGst,
      discount: finalDiscount,
      status: 'ACTIVE',
      stockStatus: 'OUT_OF_STOCK'
    });

    await product.save();

    // Save entry in barcodes collection
    const newBarcode = new Barcode({
      productId: product._id,
      barcodeNumber: barcode,
      barcodeType: 'CODE128',
      generatedBy: req.user.userId
    });
    await newBarcode.save();

    // 7. Return created product
    return res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      data: {
        productId: product.productId,
        barcode: product.barcode
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Product
 */
export const updateProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // 1. Verify product exists
    const query = mongoose.Types.ObjectId.isValid(productId)
      ? { $or: [{ _id: productId }, { productId }] }
      : { productId };
    const product = await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      });
    }

    // 2. Validate request body
    const validation = validateProductUpdate(req.body);
    if (!validation.status) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: [validation.message]
      });
    }

    const { productName, brandId, categoryId, size, color, mrp, gst, discount, status } = req.body;

    // 3. Validate Brand if updated
    if (brandId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(brandId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid brand ID.'
        });
      }
      const brand = await Brand.findById(brandId);
      if (!brand) {
        return res.status(404).json({
          success: false,
          message: 'Brand not found.'
        });
      }
      product.brandId = brandId;
    }

    // 4. Validate Category if updated
    if (categoryId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category ID.'
        });
      }
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found.'
        });
      }
      product.categoryId = categoryId;
    }

    // 5. Check duplicate if uniqueness fields are updated
    const newName = productName !== undefined ? productName.trim() : product.productName;
    const newBrandId = brandId !== undefined ? brandId : product.brandId;
    const newCategoryId = categoryId !== undefined ? categoryId : product.categoryId;
    const newSize = size !== undefined ? size.toUpperCase().trim() : product.size;
    const newColor = color !== undefined ? color.trim() : product.color;

    if (
      productName !== undefined ||
      brandId !== undefined ||
      categoryId !== undefined ||
      size !== undefined ||
      color !== undefined
    ) {
      const duplicate = await Product.findOne({
        _id: { $ne: product._id },
        productName: { $regex: new RegExp(`^${newName}$`, 'i') },
        brandId: newBrandId,
        categoryId: newCategoryId,
        size: newSize,
        color: { $regex: new RegExp(`^${newColor}$`, 'i') }
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'Product already exists.'
        });
      }
    }

    // 6. Update fields
    if (productName !== undefined) product.productName = newName;
    if (size !== undefined) product.size = newSize;
    if (color !== undefined) product.color = newColor;
    if (mrp !== undefined) product.mrp = mrp;
    if (gst !== undefined) product.gst = gst;
    if (discount !== undefined) product.discount = discount;
    if (status !== undefined) product.status = status.toUpperCase();

    await product.save();

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      data: product
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Product (Soft Delete)
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(productId)
      ? { $or: [{ _id: productId }, { productId }] }
      : { productId };
    const product = await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      });
    }

    await product.softDelete();

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Product By ID
 */
export const getProductById = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(productId)
      ? { $or: [{ _id: productId }, { productId }] }
      : { productId };
    const product = await Product.findOne(query)
      .populate('brandId')
      .populate('categoryId');

    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: 'Product not found.',
        Result: null,
        StatusCode: 404
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Product retrieved successfully.',
      Result: product,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to build mongoose query filter from request query parameters
 */
const buildProductQueryFilter = async (query) => {
  const filter = { isDeleted: { $ne: true } };

  if (query.brand) {
    filter.brandId = query.brand;
  }
  if (query.category) {
    filter.categoryId = query.category;
  }
  if (query.size) {
    filter.size = query.size.toUpperCase().trim();
  }
  if (query.color) {
    filter.color = { $regex: new RegExp(query.color.trim(), 'i') };
  }
  if (query.status) {
    filter.status = query.status.toUpperCase().trim();
  }
  if (query.gst) {
    filter.gst = Number(query.gst);
  }
  if (query.discount) {
    filter.discount = Number(query.discount);
  }
  if (query.minPrice || query.maxPrice) {
    filter.mrp = {};
    if (query.minPrice) filter.mrp.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.mrp.$lte = Number(query.maxPrice);
  }

  // Handle q search (Product Name, Barcode, Brand, Category)
  if (query.q) {
    const searchTerm = query.q.trim();
    // Lookup matching brands & categories
    const matchedBrands = await Brand.find({ brandName: { $regex: new RegExp(searchTerm, 'i') } });
    const brandIds = matchedBrands.map((b) => b._id);

    const matchedCategories = await Category.find({ categoryName: { $regex: new RegExp(searchTerm, 'i') } });
    const categoryIds = matchedCategories.map((c) => c._id);

    filter.$or = [
      { productName: { $regex: new RegExp(searchTerm, 'i') } },
      { barcode: searchTerm },
      { brandId: { $in: brandIds } },
      { categoryId: { $in: categoryIds } }
    ];
  }

  return filter;
};

/**
 * Get All Products (with Pagination, Sorting, Filtering, and Search)
 */
export const getAllProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const sortBy = req.query.sortBy || 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: order };

    const filter = await buildProductQueryFilter(req.query);

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate('brandId')
      .populate('categoryId')
      .sort(sortObj)
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      Success: true,
      Message: 'Products retrieved successfully.',
      Result: products,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search Products
 */
export const searchProducts = async (req, res, next) => {
  try {
    const filter = await buildProductQueryFilter({ q: req.query.q });
    const products = await Product.find(filter)
      .populate('brandId')
      .populate('categoryId');

    return res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Filter Products
 */
export const filterProducts = async (req, res, next) => {
  try {
    const filter = await buildProductQueryFilter(req.query);
    const products = await Product.find(filter)
      .populate('brandId')
      .populate('categoryId');

    return res.status(200).json({
      Success: true,
      Message: 'Products filtered successfully.',
      Result: products,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload Product Images
 */
export const uploadProductImages = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(productId)
      ? { $or: [{ _id: productId }, { productId }] }
      : { productId };
    const product = await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files were uploaded.'
      });
    }

    // Upload all files to Cloudinary concurrently
    const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
    const secureUrls = await Promise.all(uploadPromises);

    // Map Cloudinary secure URLs to stored image structures
    const imagesArray = secureUrls.map((url, index) => ({
      imageUrl: url,
      displayOrder: product.images.length + index,
      isPrimary: product.images.length === 0 && index === 0
    }));

    product.images.push(...imagesArray);
    await product.save();

    return res.status(200).json({
      success: true,
      message: 'Images uploaded successfully.',
      data: product.images
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Product Stock Status
 */
export const updateProductStockStatus = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { stockStatus } = req.body;

    const ALLOWED_STOCK_STATUS = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED'];
    if (!stockStatus || !ALLOWED_STOCK_STATUS.includes(stockStatus.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid stockStatus. Must be one of: ${ALLOWED_STOCK_STATUS.join(', ')}`
      });
    }

    const query = mongoose.Types.ObjectId.isValid(productId)
      ? { $or: [{ _id: productId }, { productId }] }
      : { productId };
    const product = await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      });
    }

    product.stockStatus = stockStatus.toUpperCase();
    await product.save();

    return res.status(200).json({
      success: true,
      message: 'Stock status updated successfully.',
      data: {
        productId: product.productId,
        stockStatus: product.stockStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search Product By Barcode
 */
export const getProductByBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.params;
    const product = await Product.findOne({ barcode, isDeleted: { $ne: true } })
      .populate('brandId')
      .populate('categoryId');

    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: 'Product not found.',
        StatusCode: 404
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Product retrieved successfully by barcode.',
      Result: product,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
