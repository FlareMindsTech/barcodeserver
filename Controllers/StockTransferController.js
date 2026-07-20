/**
 * @file StockTransferController.js
 * @description Controller for Stock Transfer Management operations.
 */

import mongoose from 'mongoose';
import Product from '../Models/Product.js';
import StockTransfer from '../Models/StockTransfer.js';
import FactoryInventory from '../Models/FactoryInventory.js';
import RetailInventory from '../Models/RetailInventory.js';
import RetailStockMovement from '../Models/RetailStockMovement.js';
import { getProductCurrentStock } from './FactoryInventoryController.js';

/**
 * Transfer Factory → Retail (POST /api/stock-transfer/retail)
 */
export const transferFactoryToRetail = async (req, res, next) => {
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

    // Check Factory Stock availability
    const currentFactoryStock = await getProductCurrentStock(product._id);
    if (currentFactoryStock < quantity) {
      return res.status(400).json({
        Success: false,
        Message: 'Insufficient Factory Stock',
        StatusCode: 400
      });
    }

    // 1. Reduce Factory Stock (record outward movement)
    const factoryMovement = new FactoryInventory({
      productId: product._id,
      quantity,
      movementType: 'outward',
      remarks: 'Transfer to Retail'
    });
    await factoryMovement.save();

    // 2. Increase Retail Stock
    await RetailInventory.adjustStock(product._id, quantity);

    // 3. Record Retail Stock Movement
    const retailMovement = new RetailStockMovement({
      productId: product._id,
      movementType: 'received',
      quantity,
      remarks: 'Received from Factory'
    });
    await retailMovement.save();

    // 4. Save Stock Transfer History
    const transfer = new StockTransfer({
      productId: product._id,
      fromLocation: 'Factory',
      toLocation: 'Retail',
      quantity,
      status: 'completed',
      transferredBy: req.user.userId,
      remarks: 'Transfer to Retail'
    });
    await transfer.save();

    // Dynamically update product stockStatus on factory
    const finalFactoryStock = currentFactoryStock - quantity;
    if (finalFactoryStock <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
      await product.save();
    }

    return res.status(200).json({
      Success: true,
      Message: 'Stock transferred successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Transfer Factory → Online (POST /api/stock-transfer/online)
 */
export const transferFactoryToOnline = async (req, res, next) => {
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

    // Check Factory Stock availability
    const currentFactoryStock = await getProductCurrentStock(product._id);
    if (currentFactoryStock < quantity) {
      return res.status(400).json({
        Success: false,
        Message: 'Insufficient Factory Stock',
        StatusCode: 400
      });
    }

    // 1. Reduce Factory Stock (record outward movement)
    const factoryMovement = new FactoryInventory({
      productId: product._id,
      quantity,
      movementType: 'outward',
      remarks: 'Transfer to Online'
    });
    await factoryMovement.save();

    // 2. Save Stock Transfer History (Online dispatch)
    const transfer = new StockTransfer({
      productId: product._id,
      fromLocation: 'Factory',
      toLocation: 'Online',
      quantity,
      status: 'completed',
      transferredBy: req.user.userId,
      remarks: 'Transfer to Online'
    });
    await transfer.save();

    // Dynamically update product stockStatus on factory
    const finalFactoryStock = currentFactoryStock - quantity;
    if (finalFactoryStock <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
      await product.save();
    }

    return res.status(200).json({
      Success: true,
      Message: 'Online dispatch recorded successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Transfer History (GET /api/stock-transfer/history)
 */
export const getTransferHistory = async (req, res, next) => {
  try {
    const history = await StockTransfer.find({})
      .populate({
        path: 'productId',
        populate: [{ path: 'brandId' }, { path: 'categoryId' }]
      })
      .populate('transferredBy', 'username email')
      .sort({ transferDate: -1 });

    const result = history.map((item) => {
      const prod = item.productId;
      return {
        id: item._id,
        date: item.transferDate,
        productName: prod ? prod.productName : 'Unknown Product',
        productId: prod ? (prod.productId || prod._id.toString()) : '',
        from: item.fromLocation,
        to: item.toLocation,
        quantity: item.quantity,
        status: item.status,
        transferredBy: item.transferredBy ? item.transferredBy.username : 'System'
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Stock transfer history retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel Transfer (PUT /api/stock-transfer/:transferId/cancel)
 */
export const cancelStockTransfer = async (req, res, next) => {
  try {
    const { transferId } = req.params;

    const transfer = await StockTransfer.findById(transferId);
    if (!transfer) {
      return res.status(404).json({
        Success: false,
        Message: 'Stock transfer record not found.',
        StatusCode: 404
      });
    }

    if (transfer.status === 'cancelled') {
      return res.status(400).json({
        Success: false,
        Message: 'Stock transfer is already cancelled.',
        StatusCode: 400
      });
    }

    // Reverse inventory movement if the status was completed
    if (transfer.status === 'completed') {
      const { productId, quantity, fromLocation, toLocation } = transfer;

      if (fromLocation === 'Factory' && toLocation === 'Retail') {
        // Reverse Factory-to-Retail Transfer
        // 1. Verify Retail Stock is sufficient to return to Factory
        const retailInv = await RetailInventory.findOne({ productId });
        const currentRetailStock = retailInv ? retailInv.quantity : 0;

        if (currentRetailStock < quantity) {
          return res.status(400).json({
            Success: false,
            Message: 'Cannot cancel transfer: Insufficient Retail Stock to reverse.',
            StatusCode: 400
          });
        }

        // 2. Reduce Retail Inventory
        await RetailInventory.adjustStock(productId, -quantity);

        // 3. Record Retail Outward Movement
        const retailMovement = new RetailStockMovement({
          productId,
          movementType: 'adjustment',
          quantity: -quantity,
          remarks: `Transfer ${transfer._id} Cancelled`
        });
        await retailMovement.save();

        // 4. Increase Factory Inventory (Record inward movement)
        const factoryMovement = new FactoryInventory({
          productId,
          quantity,
          movementType: 'inward',
          remarks: `Transfer ${transfer._id} Cancelled`
        });
        await factoryMovement.save();

      } else if (fromLocation === 'Factory' && toLocation === 'Online') {
        // Reverse Factory-to-Online Transfer
        // 1. Increase Factory Inventory (Record inward movement)
        const factoryMovement = new FactoryInventory({
          productId,
          quantity,
          movementType: 'inward',
          remarks: `Transfer ${transfer._id} Cancelled`
        });
        await factoryMovement.save();
      }
    }

    // Mark transfer status as cancelled
    transfer.status = 'cancelled';
    await transfer.save();

    return res.status(200).json({
      Success: true,
      Message: 'Stock transfer cancelled and inventory reversed successfully.',
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
