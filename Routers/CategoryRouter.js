/**
 * @file CategoryRouter.js
 * @description Router for Category management endpoints.
 */

import express from 'express';
import {
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory
} from '../Controllers/CategoryController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

router.use(authenticate);

// 1. Get all categories
router.get('/', getAllCategories);

// 2. Create category (Admin and Stock Manager only)
router.post('/', authorize(['ADMIN', 'STOCK_MANAGER']), createCategory);

// 3. Update category (Admin and Stock Manager only)
router.put('/:id', authorize(['ADMIN', 'STOCK_MANAGER']), updateCategory);

// 4. Soft delete category (Admin only)
router.delete('/:id', authorize(['ADMIN']), deleteCategory);

export default router;
