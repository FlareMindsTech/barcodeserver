/**
 * @file FactoryInventoryController.js
 * @description Controller for Factory Inventory Management operations.
 */

import mongoose from 'mongoose';
import Product from '../Models/Product.js';
import FactoryInventory from '../Models/FactoryInventory.js';

/**
 * Helper to calculate current stock for a specific product ID
 * @param {mongoose.Types.ObjectId} productId 
 * @returns {Promise<number>} current stock quantity
 */
export const getProductCurrentStock = async (productId) => {
  const movements = await FactoryInventory.find({ productId });
  let stock = 0;
  for (const m of movements) {
    if (m.movementType === 'inward') {
      stock += m.quantity;
    } else if (m.movementType === 'outward') {
      stock -= m.quantity;
    } else if (m.movementType === 'adjustment') {
      stock += m.quantity; // Adjustment quantity is stored as delta (can be positive or negative)
    }
  }
  return stock;
};

/**
 * Add Produced Stock (POST /api/factory-inventory)
 */
export const addProducedStock = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({
        Success: false,
        Message: 'Product ID is required.',
        StatusCode: 400
      });
    }

    if (quantity === undefined || typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Quantity must be a positive number.',
        StatusCode: 400
      });
    }

    // Verify product exists
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

    // Record inward production movement
    const movement = new FactoryInventory({
      productId: product._id,
      quantity,
      movementType: 'inward',
      remarks: 'Production'
    });

    await movement.save();

    // Dynamically update product stockStatus based on new stock level
    const currentStock = await getProductCurrentStock(product._id);
    if (product.stockStatus === 'OUT_OF_STOCK' && currentStock > 0) {
      product.stockStatus = 'IN_STOCK';
      await product.save();
    }

    return res.status(201).json({
      Success: true,
      Message: 'Factory stock added successfully.',
      StatusCode: 201
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Factory Stock (PUT /api/factory-inventory/:productId)
 * Updates factory stock to a specific target quantity via an adjustment transaction.
 */
export const updateFactoryStock = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Quantity must be a non-negative number.',
        StatusCode: 400
      });
    }

    // Verify product exists
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

    const currentStock = await getProductCurrentStock(product._id);
    const delta = quantity - currentStock;

    if (delta === 0) {
      return res.status(200).json({
        Success: true,
        Message: 'Factory stock is already at the requested quantity.',
        StatusCode: 200
      });
    }

    // Record adjustment movement
    const movement = new FactoryInventory({
      productId: product._id,
      quantity: delta,
      movementType: 'adjustment',
      remarks: 'Manual Stock Correction'
    });

    await movement.save();

    // Dynamically update product stockStatus
    const newStock = currentStock + delta;
    product.stockStatus = newStock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
    await product.save();

    return res.status(200).json({
      Success: true,
      Message: 'Factory stock updated successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove Factory Stock (DELETE /api/factory-inventory/:productId)
 * Removes stock due to damage, disposal, or other reasons.
 */
export const removeFactoryStock = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity, reason } = req.body;

    const removeQty = quantity !== undefined ? Number(quantity) : 1;
    if (isNaN(removeQty) || removeQty <= 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Quantity to remove must be a positive number.',
        StatusCode: 400
      });
    }

    // Verify product exists
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

    const currentStock = await getProductCurrentStock(product._id);
    if (currentStock < removeQty) {
      return res.status(400).json({
        Success: false,
        Message: 'Insufficient Factory Stock',
        StatusCode: 400
      });
    }

    // Record outward movement
    const movement = new FactoryInventory({
      productId: product._id,
      quantity: removeQty,
      movementType: 'outward',
      remarks: reason || 'Disposal'
    });

    await movement.save();

    // Update stockStatus if out of stock
    const newStock = currentStock - removeQty;
    if (newStock <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
      await product.save();
    }

    return res.status(200).json({
      Success: true,
      Message: 'Factory stock removed successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Adjust Factory Stock (PUT /api/factory-inventory/adjust)
 * Adjusts inventory to match actual physical count.
 */
export const adjustFactoryStock = async (req, res, next) => {
  try {
    const { productId, actualQuantity, reason } = req.body;

    if (!productId) {
      return res.status(400).json({
        Success: false,
        Message: 'Product ID is required.',
        StatusCode: 400
      });
    }

    if (actualQuantity === undefined || typeof actualQuantity !== 'number' || actualQuantity < 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Actual quantity must be a non-negative number.',
        StatusCode: 400
      });
    }

    // Verify product exists
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

    const currentStock = await getProductCurrentStock(product._id);
    const delta = actualQuantity - currentStock;

    if (delta === 0) {
      return res.status(200).json({
        Success: true,
        Message: 'Physical verification matches system stock. No adjustment needed.',
        StatusCode: 200
      });
    }

    // Record adjustment movement
    const movement = new FactoryInventory({
      productId: product._id,
      quantity: delta,
      movementType: 'adjustment',
      remarks: reason || 'Physical Stock Verification'
    });

    await movement.save();

    // Update stockStatus
    product.stockStatus = actualQuantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
    await product.save();

    return res.status(200).json({
      Success: true,
      Message: 'Factory stock adjusted successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Factory Inventory (GET /api/factory-inventory)
 */
export const getFactoryInventory = async (req, res, next) => {
  try {
    // Get all products
    const products = await Product.find({ isDeleted: { $ne: true } })
      .populate('brandId')
      .populate('categoryId');

    const result = [];
    for (const product of products) {
      const quantity = await getProductCurrentStock(product._id);
      result.push({
        product: {
          id: product.productId,
          _id: product._id,
          productName: product.productName,
          size: product.size,
          color: product.color,
          barcode: product.barcode,
          mrp: product.mrp,
          brand: product.brandId ? product.brandId.brandName : '',
          category: product.categoryId ? product.categoryId.categoryName : ''
        },
        quantity
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Factory inventory retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Factory Stock History (GET /api/factory-inventory/history)
 */
export const getFactoryStockHistory = async (req, res, next) => {
  try {
    const history = await FactoryInventory.find({})
      .populate({
        path: 'productId',
        populate: [{ path: 'brandId' }, { path: 'categoryId' }]
      })
      .sort({ lastUpdated: -1 });

    const result = history.map((item) => {
      const prod = item.productId;
      return {
        id: item._id,
        date: item.lastUpdated,
        productName: prod ? prod.productName : 'Unknown Product',
        productId: prod ? (prod.productId || prod._id.toString()) : '',
        size: prod ? prod.size : '',
        color: prod ? prod.color : '',
        type: item.remarks || item.movementType,
        quantity: item.quantity,
        movementType: item.movementType
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Factory stock history retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
