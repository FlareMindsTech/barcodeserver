/**
 * @file RetailInventoryController.js
 * @description Controller for Retail Inventory Management operations.
 */

import mongoose from 'mongoose';
import Product from '../Models/Product.js';
import RetailInventory from '../Models/RetailInventory.js';
import RetailStockMovement from '../Models/RetailStockMovement.js';
import StockTransfer from '../Models/StockTransfer.js';

/**
 * Receive Stock (POST /api/retail-inventory/receive)
 */
export const receiveStock = async (req, res, next) => {
  try {
    const { productId, quantity, transferId } = req.body;

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

    let remarksText = 'Received from Factory';

    // If transferId is provided, validate the transfer log
    if (transferId) {
      const transferQuery = mongoose.Types.ObjectId.isValid(transferId)
        ? { _id: transferId }
        : { remarks: { $regex: new RegExp(transferId, 'i') } }; // Or direct lookup if it matches custom ID
      
      const transfer = await StockTransfer.findOne({
        $or: [
          mongoose.Types.ObjectId.isValid(transferId) ? { _id: transferId } : null,
          { _id: mongoose.Types.ObjectId.isValid(transferId) ? transferId : new mongoose.Types.ObjectId() } // fallback
        ].filter(Boolean)
      });

      if (transfer) {
        if (transfer.productId.toString() !== product._id.toString()) {
          return res.status(400).json({
            Success: false,
            Message: 'Transfer Product ID does not match the received Product ID.',
            StatusCode: 400
          });
        }
        if (transfer.status !== 'pending') {
          return res.status(400).json({
            Success: false,
            Message: `Stock transfer is already ${transfer.status}.`,
            StatusCode: 400
          });
        }

        // Update transfer status
        transfer.status = 'completed';
        await transfer.save();
        remarksText = `Received from Factory. Transfer ID: ${transfer._id}`;
      }
    }

    // Increase retail stock using helper
    await RetailInventory.adjustStock(product._id, quantity);

    // Record stock movement history
    const movement = new RetailStockMovement({
      productId: product._id,
      movementType: 'received',
      quantity,
      remarks: remarksText
    });
    await movement.save();

    // Dynamically update product stockStatus on the master database
    if (product.stockStatus === 'OUT_OF_STOCK') {
      product.stockStatus = 'IN_STOCK';
      await product.save();
    }

    return res.status(200).json({
      Success: true,
      Message: 'Stock received successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Retail Stock (PUT /api/retail-inventory/:productId)
 * Updates retail stock to a specific target quantity via an adjustment transaction.
 */
export const updateRetailStock = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity, minimumStock } = req.body;

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

    // Find or create RetailInventory record
    let inventory = await RetailInventory.findOne({ productId: product._id });
    const currentQty = inventory ? inventory.quantity : 0;
    const delta = quantity - currentQty;

    if (!inventory) {
      inventory = new RetailInventory({
        productId: product._id,
        quantity,
        minimumStock: minimumStock !== undefined ? minimumStock : 10
      });
    } else {
      inventory.quantity = quantity;
      if (minimumStock !== undefined) {
        inventory.minimumStock = minimumStock;
      }
    }

    await inventory.save();

    // Record stock movement if there is a change
    if (delta !== 0) {
      const movement = new RetailStockMovement({
        productId: product._id,
        movementType: 'adjustment',
        quantity: delta,
        remarks: 'Manual retail stock correction'
      });
      await movement.save();
    }

    return res.status(200).json({
      Success: true,
      Message: 'Retail stock updated successfully.',
      Result: inventory,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Stock Adjustment (PUT /api/retail-inventory/adjust)
 * Corrects inventory count based on physical counting.
 */
export const adjustRetailStock = async (req, res, next) => {
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

    // Find or create RetailInventory record
    let inventory = await RetailInventory.findOne({ productId: product._id });
    const currentQty = inventory ? inventory.quantity : 0;
    const delta = actualQuantity - currentQty;

    if (delta === 0) {
      return res.status(200).json({
        Success: true,
        Message: 'Physical verification matches system stock. No adjustment needed.',
        StatusCode: 200
      });
    }

    if (!inventory) {
      inventory = new RetailInventory({
        productId: product._id,
        quantity: actualQuantity
      });
    } else {
      inventory.quantity = actualQuantity;
    }

    await inventory.save();

    // Record adjustment history
    const movement = new RetailStockMovement({
      productId: product._id,
      movementType: 'adjustment',
      quantity: delta,
      remarks: reason || 'Physical Stock Count'
    });
    await movement.save();

    return res.status(200).json({
      Success: true,
      Message: 'Retail stock adjusted successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Retail Inventory (GET /api/retail-inventory)
 */
export const getRetailInventory = async (req, res, next) => {
  try {
    const inventories = await RetailInventory.find({})
      .populate({
        path: 'productId',
        populate: [{ path: 'brandId' }, { path: 'categoryId' }]
      })
      .sort({ lastUpdated: -1 });

    const result = inventories.map((item) => {
      const prod = item.productId;
      return {
        product: {
          id: prod ? prod.productId : '',
          _id: prod ? prod._id : null,
          productName: prod ? prod.productName : 'Unknown Product',
          size: prod ? prod.size : '',
          color: prod ? prod.color : '',
          barcode: prod ? prod.barcode : '',
          mrp: prod ? prod.mrp : 0,
          brand: prod && prod.brandId ? prod.brandId.brandName : '',
          category: prod && prod.categoryId ? prod.categoryId.categoryName : ''
        },
        quantity: item.quantity,
        minimumStock: item.minimumStock,
        stockStatus: item.stockStatus,
        lastUpdated: item.lastUpdated
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Retail inventory retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Low Stock (GET /api/retail-inventory/low-stock)
 */
export const getLowStock = async (req, res, next) => {
  try {
    const lowStockInventories = await RetailInventory.find({
      stockStatus: { $in: ['low_stock', 'out_of_stock'] }
    })
      .populate({
        path: 'productId',
        populate: [{ path: 'brandId' }, { path: 'categoryId' }]
      })
      .sort({ quantity: 1 });

    const result = lowStockInventories.map((item) => {
      const prod = item.productId;
      return {
        productName: prod ? prod.productName : 'Unknown Product',
        currentStock: item.quantity,
        minimumStock: item.minimumStock,
        stockStatus: item.stockStatus,
        productId: prod ? (prod.productId || prod._id.toString()) : ''
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Low stock products retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Retail Stock History (GET /api/retail-inventory/history)
 */
export const getRetailStockHistory = async (req, res, next) => {
  try {
    const history = await RetailStockMovement.find({})
      .populate({
        path: 'productId',
        populate: [{ path: 'brandId' }, { path: 'categoryId' }]
      })
      .sort({ createdAt: -1 });

    const result = history.map((item) => {
      const prod = item.productId;
      return {
        id: item._id,
        date: item.createdAt,
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
      Message: 'Retail stock history retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
