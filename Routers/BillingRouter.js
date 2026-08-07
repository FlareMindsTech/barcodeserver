/**
 * @file BillingRouter.js
 * @description Router for Point of Sale (POS) billing operations.
 */

import express from 'express';
import {
  scanBarcode,
  searchProducts,
  createBill,
  getOpenBills,
  deleteBill,
  addItem,
  removeItem,
  updateQuantity,
  generateBill,
  processPayment
} from '../Controllers/BillingController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all billing routes
router.use(authenticate);

// Authorize access to ADMIN and STAFF (Cashier/Biller role)
router.use(authorize(['ADMIN', 'STAFF']));

// 1. Scan Barcode
router.post('/scan', scanBarcode);

// 2. Search Product
router.get('/search', searchProducts);

// 2b. Start a new bill for a waiting customer
router.post('/bills', createBill);

// 2c. Get the cashier's open (unpaid) bills — the waiting queue
router.get('/bills', getOpenBills);

// 2d. Discard an open bill
router.delete('/bills/:billId', deleteBill);

// 3. Add Item
router.post('/items', addItem);

// 4. Remove Item
router.delete('/items/:itemId', removeItem);

// 5. Update Quantity
router.put('/items/:itemId', updateQuantity);

// 6. Generate Bill
router.post('/generate', generateBill);

// 7. Process Payment
router.post('/payment', processPayment);

export default router;
