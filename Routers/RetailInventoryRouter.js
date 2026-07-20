/**
 * @file RetailInventoryRouter.js
 * @description Router for Retail Inventory Management endpoints.
 */

import express from 'express';
import {
  receiveStock,
  updateRetailStock,
  adjustRetailStock,
  getRetailInventory,
  getLowStock,
  getRetailStockHistory
} from '../Controllers/RetailInventoryController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

router.use(authenticate);

// 1. Get Retail Stock History (Place before dynamic ID routes)
router.get('/history', getRetailStockHistory);

// 2. Get Low Stock Products (Place before dynamic ID routes)
router.get('/low-stock', getLowStock);

// 3. Stock Adjustment (Place before dynamic ID routes)
router.put('/adjust', authorize(['ADMIN', 'STOCK_MANAGER']), adjustRetailStock);

// 4. Receive stock transferred from Factory
router.post('/receive', authorize(['ADMIN', 'STOCK_MANAGER']), receiveStock);

// 5. Get current Retail Inventory list
router.get('/', getRetailInventory);

// 6. Update Retail Stock (Manual Correction)
router.put('/:productId', authorize(['ADMIN', 'STOCK_MANAGER']), updateRetailStock);

export default router;
