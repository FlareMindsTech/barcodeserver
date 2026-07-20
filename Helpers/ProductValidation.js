/**
 * @file ProductValidation.js
 * @description Input validation functions for Product management.
 */

const VALID_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/**
 * Validate product creation input
 */
export const validateProductCreation = (body) => {
  if (!body.productName || typeof body.productName !== 'string' || body.productName.trim() === '') {
    return { status: false, message: 'Product Name is required.' };
  }
  if (!body.brandId) {
    return { status: false, message: 'Brand is required.' };
  }
  if (!body.categoryId) {
    return { status: false, message: 'Category is required.' };
  }
  if (!body.size) {
    return { status: false, message: 'Size is required.' };
  }
  if (!VALID_SIZES.includes(body.size.toUpperCase())) {
    return { status: false, message: 'Invalid Size. Must be one of XS, S, M, L, XL, XXL.' };
  }
  if (!body.color || typeof body.color !== 'string' || body.color.trim() === '') {
    return { status: false, message: 'Color is required.' };
  }
  if (body.mrp === undefined || body.mrp === null || typeof body.mrp !== 'number' || body.mrp <= 0) {
    return { status: false, message: 'MRP must be greater than 0.' };
  }
  if (body.gst !== undefined && body.gst !== null) {
    if (typeof body.gst !== 'number' || body.gst < 0) {
      return { status: false, message: 'GST must be greater than or equal to 0.' };
    }
  }
  if (body.discount !== undefined && body.discount !== null) {
    if (typeof body.discount !== 'number' || body.discount < 0 || body.discount > 100) {
      return { status: false, message: 'Discount must be between 0 and 100.' };
    }
  }
  return { status: true };
};

/**
 * Validate product update input
 */
export const validateProductUpdate = (body) => {
  if (body.productName !== undefined && (typeof body.productName !== 'string' || body.productName.trim() === '')) {
    return { status: false, message: 'Product Name cannot be empty.' };
  }
  if (body.size !== undefined) {
    if (!VALID_SIZES.includes(body.size.toUpperCase())) {
      return { status: false, message: 'Invalid Size. Must be one of XS, S, M, L, XL, XXL.' };
    }
  }
  if (body.color !== undefined && (typeof body.color !== 'string' || body.color.trim() === '')) {
    return { status: false, message: 'Color cannot be empty.' };
  }
  if (body.mrp !== undefined && (typeof body.mrp !== 'number' || body.mrp <= 0)) {
    return { status: false, message: 'MRP must be greater than 0.' };
  }
  if (body.gst !== undefined && (typeof body.gst !== 'number' || body.gst < 0)) {
    return { status: false, message: 'GST must be greater than or equal to 0.' };
  }
  if (body.discount !== undefined && (typeof body.discount !== 'number' || body.discount < 0 || body.discount > 100)) {
    return { status: false, message: 'Discount must be between 0 and 100.' };
  }
  return { status: true };
};