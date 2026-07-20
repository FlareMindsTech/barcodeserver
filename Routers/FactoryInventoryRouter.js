/**
 * @file FactoryInventoryRouter.js
 * @description Router for Factory Inventory Management endpoints.
 */

import express from 'express';
import {
  addProducedStock,
  updateFactoryStock,
  removeFactoryStock,
  adjustFactoryStock,
  getFactoryInventory,
  getFactoryStockHistory
} from '../Controllers/FactoryInventoryController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

router.use(authenticate);

// 1. Get Factory Stock History (Place before dynamic ID routes)
router.get('/history', getFactoryStockHistory);

// 2. Adjust Factory Stock (Place before dynamic ID routes)
router.put('/adjust', authorize(['ADMIN', 'STOCK_MANAGER']), adjustFactoryStock);

// 3. Get current Factory Inventory list
router.get('/', getFactoryInventory);

// 4. Add Produced Stock
router.post('/', authorize(['ADMIN', 'STOCK_MANAGER']), addProducedStock);

// 5. Update Factory Stock (Manual Correction)
router.put('/:productId', authorize(['ADMIN', 'STOCK_MANAGER']), updateFactoryStock);

// 6. Remove Factory Stock (Damage / Disposal)
router.delete('/:productId', authorize(['ADMIN', 'STOCK_MANAGER']), removeFactoryStock);

export default router;
