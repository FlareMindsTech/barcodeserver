/**
 * @file ReportsRouter.js
 * @description Router for Reports & Analytics endpoints, restricted to Admin users.
 */

import express from 'express';
import {
  getDashboardSummary,
  getSalesReport,
  getInventoryReport,
  getFactoryInventoryReport,
  getRetailInventoryReport,
  getStockTransferReport,
  getGstReport,
  getProfitReport,
  getLowStockReport,
  getBestSellingReport
} from '../Controllers/ReportsController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all report routes
router.use(authenticate);

// Authorize access to ADMIN only
router.use(authorize(['ADMIN']));

// 1. Dashboard Summary
router.get('/dashboard', getDashboardSummary);

// 2. Sales Report
router.get('/sales', getSalesReport);

// 3. Inventory Report
router.get('/inventory', getInventoryReport);

// 4. Factory Inventory Report
router.get('/factory-inventory', getFactoryInventoryReport);

// 5. Retail Inventory Report
router.get('/retail-inventory', getRetailInventoryReport);

// 6. Stock Transfer Report
router.get('/stock-transfer', getStockTransferReport);

// 7. GST Report
router.get('/gst', getGstReport);

// 8. Profit Report
router.get('/profit', getProfitReport);

// 9. Low Stock Report
router.get('/low-stock', getLowStockReport);

// 10. Best Selling Products Report
router.get('/best-selling', getBestSellingReport);

export default router;
