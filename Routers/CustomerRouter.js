/**
 * @file CustomerRouter.js
 * @description Router for Customer Management endpoints.
 */

import express from 'express';
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerPurchaseHistory
} from '../Controllers/CustomerController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all customer routes
router.use(authenticate);

// Authorize access to ADMIN and STAFF
router.use(authorize(['ADMIN', 'STAFF']));

// 1. Add Customer
router.post('/', createCustomer);

// 2. Get Customer Details (supports ID or mobile number lookup)
router.get('/:customerId', getCustomer);

// 3. Update Customer Details
router.put('/:customerId', updateCustomer);

// 4. Delete / Deactivate Customer
router.delete('/:customerId', deleteCustomer);

// 5. Get Customer Purchase History
router.get('/:customerId/purchases', getCustomerPurchaseHistory);

export default router;
