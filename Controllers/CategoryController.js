/**
 * @file CategoryController.js
 * @description Controller for Category CRUD operations.
 */

import Category from '../Models/Category.js';

/**
 * Create a new Category
 */
export const createCategory = async (req, res, next) => {
  try {
    const { categoryName, status } = req.body;

    if (!categoryName || typeof categoryName !== 'string' || categoryName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Category name must be at least 2 characters long.'
      });
    }

    const cleanName = categoryName.trim();

    // Check duplicate
    const existing = await Category.findOne({ categoryName: { $regex: new RegExp(`^${cleanName}$`, 'i') } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Category already exists.'
      });
    }

    const category = new Category({
      categoryName: cleanName,
      status: status || 'active'
    });

    await category.save();

    return res.status(201).json({
      success: true,
      message: 'Category created successfully.',
      data: category
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all Categories
 */
export const getAllCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({}).sort({ categoryName: 1 });
    return res.status(200).json({
      success: true,
      message: 'Categories retrieved successfully.',
      data: categories
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete Category
 */
export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.'
      });
    }

    await category.softDelete();

    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Category
 */
export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { categoryName, status } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.'
      });
    }

    if (categoryName !== undefined) {
      if (typeof categoryName !== 'string' || categoryName.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Category name must be at least 2 characters long.'
        });
      }
      const cleanName = categoryName.trim();
      if (cleanName.toLowerCase() !== category.categoryName.toLowerCase()) {
        const existing = await Category.findOne({ categoryName: { $regex: new RegExp(`^${cleanName}$`, 'i') } });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: 'Category already exists.'
          });
        }
      }
      category.categoryName = cleanName;
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Status must be active or inactive.'
        });
      }
      category.status = status.toLowerCase();
    }

    await category.save();

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully.',
      data: category
    });
  } catch (error) {
    next(error);
  }
};
