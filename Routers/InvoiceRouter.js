/**
 * @file InvoiceRouter.js
 * @description Router for Invoice Management endpoints.
 */

import express from 'express';
import {
  createInvoice,
  getInvoice,
  getAllInvoices,
  cancelInvoice,
  getInvoicePrintData
} from '../Controllers/InvoiceController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all invoice routes
router.use(authenticate);

// Authorize access to ADMIN and STAFF (Cashier/Biller role)
router.use(authorize(['ADMIN', 'STAFF']));

// 1. Get All Invoices (Paginated, filtered, searched)
router.get('/', getAllInvoices);

// 2. Generate Invoice
router.post('/', createInvoice);

// 3. Get Specific Invoice Details
router.get('/:invoiceId', getInvoice);

// 4. Get Invoice Print Data (JSON for frontend PDF rendering — backend does not generate PDFs)
router.get('/:invoiceId/print', getInvoicePrintData);

// 5. Cancel Invoice and Restore Stock Levels
router.put('/:invoiceId/cancel', cancelInvoice);

export default router;
