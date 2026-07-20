/**
 * @file SettingsRouter.js
 * @description Router for global Settings & Configuration endpoints, restricted to Admin.
 */

import express from 'express';
import {
  getSettings,
  updateGst,
  updateDiscount,
  updateInvoicePrefix,
  updateShopInfo
} from '../Controllers/SettingsController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all settings routes
router.use(authenticate);

// Authorize access to ADMIN only
router.use(authorize(['ADMIN']));

// 1. Get Settings
router.get('/', getSettings);

// 2. Update GST
router.put('/gst', updateGst);

// 3. Update Discount
router.put('/discount', updateDiscount);

// 4. Update Invoice Prefix
router.put('/invoice-prefix', updateInvoicePrefix);

// 5. Update Shop Information
router.put('/shop', updateShopInfo);

export default router;
