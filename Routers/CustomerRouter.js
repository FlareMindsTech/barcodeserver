/**
 * @file CustomerRouter.js
 * @description Router for Customer Management endpoints.
 */

import express from 'express';
import {
  getAllCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerByPhoneNumber,
  updateCustomerByPhoneNumber,
  getCustomerPurchaseHistory
} from '../Controllers/CustomerController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all customer routes
router.use(authenticate);

// Authorize access to ADMIN and STAFF
router.use(authorize(['ADMIN', 'STAFF']));

// 1. Get all customers
router.get('/', getAllCustomers);

// 2. Add Customer
router.post('/', createCustomer);

// 3. Get Customer by phone number
router.get('/phone/:mobile', getCustomerByPhoneNumber);

// 4. Update customer by phone number
router.put('/phone/:mobile', updateCustomerByPhoneNumber);

// 5. Get Customer Details (supports ID or mobile number lookup)
router.get('/:customerId', getCustomer);

// 6. Update Customer Details
router.put('/:customerId', updateCustomer);

// 7. Delete / Deactivate Customer
router.delete('/:customerId', deleteCustomer);

// 8. Get Customer Purchase History
router.get('/:customerId/purchases', getCustomerPurchaseHistory);

export default router;
