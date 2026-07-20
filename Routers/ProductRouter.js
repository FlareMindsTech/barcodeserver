/**
 * @file ProductRouter.js
 * @description Router for Product Management endpoints.
 */

import express from 'express';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  getAllProducts,
  filterProducts,
  uploadProductImages,
  updateProductStockStatus,
  getProductByBarcode
} from '../Controllers/ProductController.js';
import { authenticate, authorize, uploadProductImage } from '../Middlewares/index.js';

const router = express.Router();

// Require JWT authentication for all product endpoints
router.use(authenticate);

// 2. Filter products (Place before dynamic ID routes)
router.get('/filter', filterProducts);

// 3. Search product by barcode (Place before dynamic ID routes)
router.get('/barcode/:barcode', getProductByBarcode);

// 4. Get all products (Paginated, sorted, filtered, searched)
router.get('/', getAllProducts);

// 5. Get product by ID
router.get('/:productId', getProductById);

// 5. Add product (Admin and Stock Manager only)
router.post('/', authorize(['ADMIN', 'STOCK_MANAGER']), createProduct);

// 6. Update product (Admin and Stock Manager only)
router.put('/:productId', authorize(['ADMIN', 'STOCK_MANAGER']), updateProduct);

// 7. Delete product - Soft delete (Admin only)
router.delete('/:productId', authorize(['ADMIN']), deleteProduct);

// 8. Upload product images (Admin and Stock Manager only)
router.post(
  '/:productId/images',
  authorize(['ADMIN', 'STOCK_MANAGER']),
  uploadProductImage.array('images', 10),
  uploadProductImages
);

// 9. Update stock status
router.put(
  '/:productId/stock-status',
  authorize(['ADMIN', 'STOCK_MANAGER']),
  updateProductStockStatus
);

export default router;
