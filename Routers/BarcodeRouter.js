/**
 * @file BarcodeRouter.js
 * @description Router for Barcode Management endpoints.
 */

import express from 'express';
import {
  generateBarcode,
  getBarcodeDetails,
  validateBarcode
} from '../Controllers/BarcodeController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

router.use(authenticate);

// 1. Generate barcode (Admin and Stock Manager only)
router.post('/generate', authorize(['ADMIN', 'STOCK_MANAGER']), generateBarcode);

// 2. Validate barcode (All authenticated users)
router.post('/validate', validateBarcode);

// 3. Get barcode details (All authenticated users)
router.get('/:barcode', getBarcodeDetails);

export default router;
