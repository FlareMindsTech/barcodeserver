
import Product from "../Models/Products.js";
import { validateProduct } from "../Helpers/ProductValidation.js";

// =====================================
// Create Product
// =====================================
export  const createProduct = async (req, res) => {
  try {
    const validation = validateProduct(req.body);

    if (!validation.status) {
      return res.status(400).json(validation);
    }

    const existingBarcode = await Product.findOne({
      "variants.barcode": {
        $in: req.body.variants.map((v) => v.barcode.toUpperCase()),
      },
    });

    if (existingBarcode) {
      return res.status(400).json({
        status: false,
        message: "One or more barcodes already exist.",
      });
    }

    const product = await Product.create(req.body);

    return res.status(201).json({
      status: true,
      message: "Product created successfully.",
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// =====================================
// Get All Products
// =====================================

export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({
      createdAt: -1,
    });

    return res.status(200).json({
      status: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// =====================================
// Get Product By ID
// =====================================

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        status: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({
      status: true,
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// =====================================
// Get Product By Barcode
// =====================================

export const getProductByBarcode = async (req, res) => {
  try {
    const barcode = req.params.barcode.toUpperCase();

    const product = await Product.findOne({
      "variants.barcode": barcode,
    });

    if (!product) {
      return res.status(404).json({
        status: false,
        message: "Barcode not found.",
      });
    }

    return res.status(200).json({
      status: true,
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// =====================================
// Update Product
// =====================================

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const validation = validateProduct(req.body);

    if (!validation.status) {
      return res.status(400).json(validation);
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: false,
        message: "Product not found.",
      });
    }

    const barcodes = req.body.variants.map((v) => v.barcode.toUpperCase());

    const duplicate = await Product.findOne({
      _id: { $ne: id },
      "variants.barcode": { $in: barcodes },
    });

    if (duplicate) {
      return res.status(400).json({
        status: false,
        message: "Barcode already exists in another product.",
      });
    }

    Object.assign(product, req.body);

    await product.save();

    return res.status(200).json({
      status: true,
      message: "Product updated successfully.",
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// =====================================
// Delete Product
// =====================================

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        status: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Product deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

