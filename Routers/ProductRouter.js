import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  getProductByBarcode,
  updateProduct,
  deleteProduct,
} from "../Controllers/ProductController.js";

const router = express.Router();

router.post("/v1/create", createProduct);
router.get("/v1/get", getAllProducts);
router.get("/v1/getbyid/:id", getProductById);
router.get("/v1/barcode/:barcode", getProductByBarcode);
router.put("/v1/update/:id", updateProduct);
router.delete("/v1/delete/:id", deleteProduct);

export default router;