/**
 * @file OnlineInventoryRouter.js
 * @description Router for Online Inventory Management endpoints.
 */

import express from 'express';
import {
  getOnlineInventory,
  adjustOnlineStock
} from '../Controllers/OnlineInventoryController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

router.use(authenticate);

// 1. Adjust Online Stock (Place before dynamic ID routes)
router.put('/adjust', authorize(['ADMIN', 'STOCK_MANAGER']), adjustOnlineStock);

// 2. Get Online Inventory list
router.get('/', getOnlineInventory);

export default router;