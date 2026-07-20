/**
 * @file BarcodeController.js
 * @description Controller for Barcode Management operations.
 */

import mongoose from 'mongoose';
import Product from '../Models/Product.js';
import Barcode from '../Models/Barcode.js';
import { generateUniqueBarcode } from '../Helpers/BarcodeGenerator.js';

/**
 * Generate Barcode (POST /api/barcodes/generate)
 */
export const generateBarcode = async (req, res, next) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        Success: false,
        Message: 'Product ID is required.',
        StatusCode: 400
      });
    }

    // Verify product exists (supports both Mongoose ObjectId and auto-generated productId)
    const query = mongoose.Types.ObjectId.isValid(productId)
      ? { $or: [{ _id: productId }, { productId }] }
      : { productId };
    const product = await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: 'Product not found.',
        StatusCode: 404
      });
    }

    // Generate unique EAN-13 barcode
    const barcodeNumber = await generateUniqueBarcode();

    // Save barcode to Product
    product.barcode = barcodeNumber;
    await product.save();

    // Save entry in barcodes collection
    const barcodeDoc = new Barcode({
      productId: product._id,
      barcodeNumber,
      barcodeType: 'EAN13',
      generatedBy: req.user.userId
    });
    await barcodeDoc.save();

    return res.status(201).json({
      Success: true,
      Message: 'Barcode generated and assigned successfully.',
      Result: {
        success: true,
        barcode: barcodeNumber
      },
      StatusCode: 201
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Barcode Details (GET /api/barcodes/:barcode)
 */
export const getBarcodeDetails = async (req, res, next) => {
  try {
    const { barcode } = req.params;

    const product = await Product.findOne({ barcode, isDeleted: { $ne: true } })
      .populate('brandId')
      .populate('categoryId');

    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: 'Barcode not found.',
        StatusCode: 404
      });
    }

    const result = {
      barcode: product.barcode,
      productName: product.productName,
      brand: product.brandId ? product.brandId.brandName : '',
      category: product.categoryId ? product.categoryId.categoryName : '',
      size: product.size,
      price: product.mrp
    };

    return res.status(200).json({
      Success: true,
      Message: 'Barcode details retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate Barcode (POST /api/barcodes/validate)
 */
export const validateBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.body;

    if (!barcode) {
      return res.status(400).json({
        Success: false,
        Message: 'Barcode is required for validation.',
        StatusCode: 400
      });
    }

    const product = await Product.findOne({ barcode, isDeleted: { $ne: true } })
      .populate('brandId')
      .populate('categoryId');

    if (!product) {
      return res.status(200).json({
        Success: true,
        Message: 'Barcode validation completed.',
        Result: {
          valid: false,
          message: 'Barcode not found.'
        },
        StatusCode: 200
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Barcode validation completed.',
      Result: {
        valid: true,
        message: 'Barcode found.',
        product
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
