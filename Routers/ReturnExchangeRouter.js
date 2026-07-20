/**
 * @file ReturnExchangeRouter.js
 * @description Router for Returns, Exchanges, and Refunds operations.
 */

import express from 'express';
import {
  returnProduct,
  exchangeProduct,
  processRefund,
  getReturnHistory
} from '../Controllers/ReturnExchangeController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all return and exchange routes
router.use(authenticate);

// Authorize access to ADMIN and STAFF
router.use(authorize(['ADMIN', 'STAFF']));

// 1. Return Product: POST /api/returns
router.post('/returns', returnProduct);

// 2. Return History: GET /api/returns/history
router.get('/returns/history', getReturnHistory);

// 3. Exchange Product: POST /api/exchanges
router.post('/exchanges', exchangeProduct);

// 4. Process Refund: POST /api/refunds
router.post('/refunds', processRefund);

export default router;
