/**
 * @file BrandController.js
 * @description Controller for Brand CRUD operations.
 */

import Brand from '../Models/Brand.js';

/**
 * Create a new Brand
 */
export const createBrand = async (req, res, next) => {
  try {
    const { brandName, status } = req.body;

    if (!brandName || typeof brandName !== 'string' || brandName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Brand name must be at least 2 characters long.'
      });
    }

    const cleanName = brandName.trim();

    // Check duplicate
    const existing = await Brand.findOne({ brandName: { $regex: new RegExp(`^${cleanName}$`, 'i') } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Brand already exists.'
      });
    }

    const brand = new Brand({
      brandName: cleanName,
      status: status || 'active'
    });

    await brand.save();

    return res.status(201).json({
      success: true,
      message: 'Brand created successfully.',
      data: brand
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all Brands
 */
export const getAllBrands = async (req, res, next) => {
  try {
    const brands = await Brand.find({}).sort({ brandName: 1 });
    return res.status(200).json({
      success: true,
      message: 'Brands retrieved successfully.',
      data: brands
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete Brand
 */
export const deleteBrand = async (req, res, next) => {
  try {
    const { id } = req.params;
    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.'
      });
    }

    await brand.softDelete();

    return res.status(200).json({
      success: true,
      message: 'Brand deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Brand
 */
export const updateBrand = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { brandName, status } = req.body;

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.'
      });
    }

    if (brandName !== undefined) {
      if (typeof brandName !== 'string' || brandName.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Brand name must be at least 2 characters long.'
        });
      }
      const cleanName = brandName.trim();
      if (cleanName.toLowerCase() !== brand.brandName.toLowerCase()) {
        const existing = await Brand.findOne({ brandName: { $regex: new RegExp(`^${cleanName}$`, 'i') } });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: 'Brand already exists.'
          });
        }
      }
      brand.brandName = cleanName;
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Status must be active or inactive.'
        });
      }
      brand.status = status.toLowerCase();
    }

    await brand.save();

    return res.status(200).json({
      success: true,
      message: 'Brand updated successfully.',
      data: brand
    });
  } catch (error) {
    next(error);
  }
};
