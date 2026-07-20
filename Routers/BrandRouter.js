/**
 * @file BrandRouter.js
 * @description Router for Brand management endpoints.
 */

import express from 'express';
import {
  createBrand,
  getAllBrands,
  updateBrand,
  deleteBrand
} from '../Controllers/BrandController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

router.use(authenticate);

// 1. Get all brands
router.get('/', getAllBrands);

// 2. Create brand (Admin and Stock Manager only)
router.post('/', authorize(['ADMIN', 'STOCK_MANAGER']), createBrand);

// 3. Update brand (Admin and Stock Manager only)
router.put('/:id', authorize(['ADMIN', 'STOCK_MANAGER']), updateBrand);

// 4. Soft delete brand (Admin only)
router.delete('/:id', authorize(['ADMIN']), deleteBrand);

export default router;
