/**
 * @file RetailInventoryController.js
 * @description Controller for Retail Inventory Management operations.
 */

import mongoose from 'mongoose';
import Product from '../Models/Product.js';
import RetailInventory from '../Models/RetailInventory.js';
import RetailStockMovement from '../Models/RetailStockMovement.js';
import StockTransfer from '../Models/StockTransfer.js';
import FactoryInventory from '../Models/FactoryInventory.js';
import { deductFactoryStock } from '../Helpers/FactoryStockManager.js';

/**
 * Receive Stock (POST /api/retail-inventory/receive)
 *
 * Two supported flows:
 *   a) transferId provided — completes a PENDING Factory→Retail transfer. The
 *      factory balance was already debited at dispatch, so this only credits
 *      retail and marks the transfer completed.
 *   b) no transferId — direct manual receipt; a guard debits the factory
 *      balance at the same time retail is credited.
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

    let transfer = null;

    // If transferId is provided, validate the transfer record strictly.
    if (transferId) {
      if (!mongoose.Types.ObjectId.isValid(transferId)) {
        return res.status(400).json({
          Success: false,
          Message: 'Invalid Transfer ID.',
          StatusCode: 400
        });
      }

      transfer = await StockTransfer.findById(transferId);
      if (!transfer) {
        return res.status(404).json({
          Success: false,
          Message: 'Stock transfer record not found.',
          StatusCode: 404
        });
      }

      if (transfer.status !== 'pending') {
        return res.status(400).json({
          Success: false,
          Message: `Cannot receive stock: transfer is already ${transfer.status}.`,
          StatusCode: 400
        });
      }

      if (!(transfer.fromLocation === 'Factory' && transfer.toLocation === 'Retail')) {
        return res.status(400).json({
          Success: false,
          Message: 'Transfer is not a Factory-to-Retail stock transfer.',
          StatusCode: 400
        });
      }

      if (transfer.productId.toString() !== product._id.toString()) {
        return res.status(400).json({
          Success: false,
          Message: 'Transfer product does not match the product being received.',
          StatusCode: 400
        });
      }

      if (transfer.quantity !== quantity) {
        return res.status(400).json({
          Success: false,
          Message: `Transfer quantity is ${transfer.quantity} but you specified ${quantity}.`,
          StatusCode: 400
        });
      }

      // Factory was debited at dispatch time — nothing more to take from factory.
    } else {
      // Manual receipt without a transfer: debit the factory balance with a
      // guarded atomic update so we never credit retail stock that the factory
      // does not actually hold.
      const deducted = await deductFactoryStock(product._id, quantity);
      if (!deducted) {
        return res.status(400).json({
          Success: false,
          Message: 'Insufficient Factory Stock to fulfill this receipt.',
          StatusCode: 400
        });
      }

      // Record the factory outward movement (audit ledger)
      const factoryMovement = new FactoryInventory({
        productId: product._id,
        quantity,
        movementType: 'outward',
        remarks: 'Manual transfer to Retail'
      });
      await factoryMovement.save();
    }

    // Increase retail stock
    await RetailInventory.adjustStock(product._id, quantity);

    // Mark the transfer completed
    if (transfer) {
      transfer.status = 'completed';
      await transfer.save();
    }

    // Record retail stock movement history
    const movement = new RetailStockMovement({
      productId: product._id,
      movementType: 'received',
      quantity,
      remarks: transfer ? `Received from Factory. Transfer ID: ${transfer._id}` : 'Received from Factory'
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
      Result: {
        transferId: transfer ? transfer._id.toString() : null,
        transferStatus: transfer ? transfer.status : null
      },
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
