/**
 * @file StockTransferRouter.js
 * @description Router for Stock Transfer Management endpoints.
 */

import express from 'express';
import {
  transferFactoryToRetail,
  transferFactoryToOnline,
  getTransferHistory,
  cancelStockTransfer
} from '../Controllers/StockTransferController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

router.use(authenticate);

// 1. Get Transfer History (Place before dynamic ID routes)
router.get('/history', getTransferHistory);

// 2. Transfer Factory to Retail
router.post('/retail', authorize(['ADMIN', 'STOCK_MANAGER']), transferFactoryToRetail);

// 3. Transfer Factory to Online (Dispatch)
router.post('/online', authorize(['ADMIN', 'STOCK_MANAGER']), transferFactoryToOnline);

// 4. Cancel Transfer
router.put('/:transferId/cancel', authorize(['ADMIN', 'STOCK_MANAGER']), cancelStockTransfer);

export default router;
