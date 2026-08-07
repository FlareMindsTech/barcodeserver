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
import OnlineInventory from '../Models/OnlineInventory.js';
import { getProductCurrentStock } from './FactoryInventoryController.js';
import {
  deductFactoryStock,
  addFactoryStock
} from '../Helpers/FactoryStockManager.js';

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

    // Check Factory Stock availability (message uses the readable pre-check)
    const currentFactoryStock = await getProductCurrentStock(product._id);
    if (currentFactoryStock < quantity) {
      return res.status(400).json({
        Success: false,
        Message: `Insufficient Factory Stock. Available: ${currentFactoryStock}.`,
        StatusCode: 400
      });
    }

    // 1. Reduce Factory Stock with a guarded atomic debit. If two dispatches
    //    race, the second one's guard fails here and we abort cleanly instead
    //    of overdrawing the balance.
    const deducted = await deductFactoryStock(product._id, quantity);
    if (!deducted) {
      return res.status(400).json({
        Success: false,
        Message: 'Insufficient Factory Stock (stock changed concurrently). Please retry.',
        StatusCode: 400
      });
    }

    // 2. Record factory outward movement (audit ledger)
    const factoryMovement = new FactoryInventory({
      productId: product._id,
      quantity,
      movementType: 'outward',
      remarks: 'Transfer to Retail'
    });
    await factoryMovement.save();

    // 3. Increase Retail Stock
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
    const finalFactoryStock = deducted.factoryStock;
    if (finalFactoryStock <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
      await product.save();
    }

    return res.status(200).json({
      Success: true,
      Message: 'Stock transferred successfully.',
      Result: {
        factoryQuantity: deducted.factoryStock
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Dispatch Factory → Retail as a PENDING transfer (POST /api/stock-transfer/retail/pending)
 * The factory is debited immediately; retail stock is credited when the store
 * confirms receipt via POST /api/retail-inventory/receive (with transferId).
 */
export const createPendingRetailTransfer = async (req, res, next) => {
  try {
    const { productId, quantity, remarks } = req.body;

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

    // Guarded atomic factory debit — the dispatch deducts immediately.
    const currentFactoryStock = await getProductCurrentStock(product._id);
    if (currentFactoryStock < quantity) {
      return res.status(400).json({
        Success: false,
        Message: `Insufficient Factory Stock. Available: ${currentFactoryStock}.`,
        StatusCode: 400
      });
    }

    const deducted = await deductFactoryStock(product._id, quantity);
    if (!deducted) {
      return res.status(400).json({
        Success: false,
        Message: 'Insufficient Factory Stock (stock changed concurrently). Please retry.',
        StatusCode: 400
      });
    }

    // Record factory outward movement (audit ledger)
    const factoryMovement = new FactoryInventory({
      productId: product._id,
      quantity,
      movementType: 'outward',
      remarks: 'Dispatch to Retail (pending receipt)'
    });
    await factoryMovement.save();

    // Save the pending Stock Transfer record
    const transfer = new StockTransfer({
      productId: product._id,
      fromLocation: 'Factory',
      toLocation: 'Retail',
      quantity,
      status: 'pending',
      transferredBy: req.user.userId,
      remarks: remarks || 'Dispatch to Retail'
    });
    await transfer.save();

    return res.status(201).json({
      Success: true,
      Message: 'Stock dispatched from Factory. Awaiting receipt confirmation at retail.',
      Result: {
        transferId: transfer._id.toString(),
        factoryQuantity: deducted.factoryStock,
        status: 'pending'
      },
      StatusCode: 201
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
        Message: `Insufficient Factory Stock. Available: ${currentFactoryStock}.`,
        StatusCode: 400
      });
    }

    // 1. Reduce Factory Stock with a guarded atomic debit (no overdraw on race)
    const deducted = await deductFactoryStock(product._id, quantity);
    if (!deducted) {
      return res.status(400).json({
        Success: false,
        Message: 'Insufficient Factory Stock (stock changed concurrently). Please retry.',
        StatusCode: 400
      });
    }

    // 2. Record factory outward movement (audit ledger)
    const factoryMovement = new FactoryInventory({
      productId: product._id,
      quantity,
      movementType: 'outward',
      remarks: 'Transfer to Online'
    });
    await factoryMovement.save();

    // 3. Credit the Online inventory ledger (was previously dropped on the floor)
    const onlineUpdated = await OnlineInventory.adjustStock(product._id, quantity);

    // 4. Save Stock Transfer History (Online dispatch)
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
    const finalFactoryStock = deducted.factoryStock;
    if (finalFactoryStock <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
      await product.save();
    }

    return res.status(200).json({
      Success: true,
      Message: 'Online dispatch recorded successfully.',
      Result: {
        onlineQuantity: onlineUpdated ? onlineUpdated.quantity : 0,
        factoryQuantity: deducted.factoryStock
      },
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

        // 4. Restore Factory balance (guarded $inc) + record inward movement
        await addFactoryStock(productId, quantity);
        const factoryMovement = new FactoryInventory({
          productId,
          quantity,
          movementType: 'inward',
          remarks: `Transfer ${transfer._id} Cancelled`
        });
        await factoryMovement.save();

      } else if (fromLocation === 'Factory' && toLocation === 'Online') {
        // Reverse Factory-to-Online Transfer
        // 1. Verify Online inventory has enough to return
        const onlineInv = await OnlineInventory.findOne({ productId });
        const currentOnlineStock = onlineInv ? onlineInv.quantity : 0;

        if (currentOnlineStock < quantity) {
          return res.status(400).json({
            Success: false,
            Message: 'Cannot cancel transfer: Insufficient Online Stock to reverse.',
            StatusCode: 400
          });
        }

        // 2. Reduce Online inventory (guarded)
        const onlineDeducted = await OnlineInventory.deductStock(productId, quantity);
        if (!onlineDeducted) {
          return res.status(400).json({
            Success: false,
            Message: 'Insufficient Online Stock to reverse (stock changed concurrently). Please retry.',
            StatusCode: 400
          });
        }

        // 3. Restore factory balance (atomically) and record inward movement
        await addFactoryStock(productId, quantity);
        const factoryMovement = new FactoryInventory({
          productId,
          quantity,
          movementType: 'inward',
          remarks: `Transfer ${transfer._id} Cancelled`
        });
        await factoryMovement.save();
      }
    } else if (transfer.status === 'pending') {
      // Pending Factory→Retail dispatches already debited the factory balance;
      // retail was never credited, so only the factory needs restoring.
      if (transfer.fromLocation === 'Factory' && transfer.toLocation === 'Retail') {
        await addFactoryStock(transfer.productId, transfer.quantity);
        const factoryMovement = new FactoryInventory({
          productId: transfer.productId,
          quantity: transfer.quantity,
          movementType: 'inward',
          remarks: `Pending transfer ${transfer._id} Cancelled`
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
