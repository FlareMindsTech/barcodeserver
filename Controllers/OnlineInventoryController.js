/**
 * @file OnlineInventoryController.js
 * @description Controller for Online Inventory Management operations.
 */

import Product from '../Models/Product.js';
import OnlineInventory from '../Models/OnlineInventory.js';

/**
 * Get Online Inventory list (GET /api/online-inventory)
 */
export const getOnlineInventory = async (req, res, next) => {
  try {
    const records = await OnlineInventory.find({})
      .populate('productId', 'productId productName size color barcode mrp stockStatus')
      .sort({ lastUpdated: -1 });

    const result = records.map((record) => ({
      id: record._id.toString(),
      productId: record.productId ? record.productId._id : null,
      productCode: record.productId ? record.productId.productId : '',
      productName: record.productId ? record.productId.productName : 'Unknown Product',
      size: record.productId ? record.productId.size : '',
      color: record.productId ? record.productId.color : '',
      barcode: record.productId ? record.productId.barcode : '',
      mrp: record.productId ? record.productId.mrp : 0,
      quantity: record.quantity,
      minimumStock: record.minimumStock,
      stockStatus: record.stockStatus,
      lastUpdated: record.lastUpdated
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Online inventory retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Adjust Online Stock (PUT /api/online-inventory/adjust)
 * Operator-driven correction of the online store balance.
 */
export const adjustOnlineStock = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({
        Success: false,
        Message: 'Product ID is required.',
        Result: null,
        StatusCode: 400
      });
    }

    if (quantity === undefined || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Quantity must be a non-negative number.',
        Result: null,
        StatusCode: 400
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        Success: false,
        Message: 'Product not found.',
        Result: null,
        StatusCode: 404
      });
    }

    const updated = await OnlineInventory.findOneAndUpdate(
      { productId },
      { $set: { quantity } },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      Success: true,
      Message: 'Online inventory adjusted successfully.',
      Result: {
        productId: product._id.toString(),
        quantity: updated.quantity,
        stockStatus: updated.stockStatus,
        lastUpdated: updated.lastUpdated
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};