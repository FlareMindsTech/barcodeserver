/**
 * @file SalesRouter.js
 * @description Router for Sales Management reports and analytical endpoints.
 */

import express from 'express';
import {
  getDailySales,
  getMonthlySales,
  getYearlySales,
  getSalesByProduct,
  getSalesByStaff,
  getSalesByCategory,
  getSalesByBrand
} from '../Controllers/SalesController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all sales analytics routes
router.use(authenticate);

// Authorize access to ADMIN and STAFF
router.use(authorize(['ADMIN', 'STAFF']));

// 1. Daily Sales
router.get('/daily', getDailySales);

// 2. Monthly Sales
router.get('/monthly', getMonthlySales);

// 3. Yearly Sales
router.get('/yearly', getYearlySales);

// 4. Sales by Product
router.get('/product', getSalesByProduct);

// 5. Sales by Staff / Cashier
router.get('/staff', getSalesByStaff);

// 6. Sales by Category
router.get('/category', getSalesByCategory);

// 7. Sales by Brand
router.get('/brand', getSalesByBrand);

export default router;
