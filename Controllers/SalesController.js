/**
 * @file SalesController.js
 * @description Controller for Sales Management and Reporting analytics.
 */

import mongoose from 'mongoose';
import Sale from '../Models/Sale.js';
import Bill from '../Models/Bill.js';
import BillItem from '../Models/BillItem.js';
import Product from '../Models/Product.js';
import Category from '../Models/Category.js';
import Brand from '../Models/Brand.js';
import User from '../Models/User.js';

/**
 * Helper to build date range and other query filters for Sales queries.
 */
const buildSalesFilter = (req) => {
  const { startDate, endDate, from, to, paymentMethod, customerId } = req.query;
  const filter = {};

  // Parse start/end dates
  const startStr = startDate || from;
  const endStr = endDate || to;

  if (startStr || endStr) {
    filter.saleDate = {};
    if (startStr) {
      filter.saleDate.$gte = new Date(startStr);
    }
    if (endStr) {
      const end = new Date(endStr);
      end.setHours(23, 59, 59, 999);
      filter.saleDate.$lte = end;
    }
  }

  // Payment Method filter
  if (paymentMethod) {
    filter.paymentMethod = { $regex: new RegExp(paymentMethod.trim(), 'i') };
  }

  // Customer filter
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    filter.customerId = customerId;
  }

  return filter;
};

/**
 * 1. Daily Sales Report
 * Endpoint: GET /api/sales/daily
 */
export const getDailySales = async (req, res, next) => {
  try {
    const { date } = req.query;
    
    // Parse target date
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const filter = buildSalesFilter(req);
    filter.saleDate = { $gte: start, $lte: end };

    // Get completed sales
    const sales = await Sale.find(filter);

    const totalBills = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

    // Calculate total quantity sold
    const billIds = sales.map((s) => s.billId);
    const items = await BillItem.find({ billId: { $in: billIds } });
    const totalQuantitySold = items.reduce((sum, item) => sum + item.quantity, 0);

    // Payment Summary (Grouped by payment method)
    const paymentMap = {};
    sales.forEach((s) => {
      const method = s.paymentMethod ? s.paymentMethod.toUpperCase() : 'UNKNOWN';
      if (!paymentMap[method]) {
        paymentMap[method] = { bills: 0, revenue: 0 };
      }
      paymentMap[method].bills += 1;
      paymentMap[method].revenue += s.totalAmount;
    });

    const paymentSummary = Object.keys(paymentMap).map((method) => ({
      paymentMethod: method,
      bills: paymentMap[method].bills,
      revenue: parseFloat(paymentMap[method].revenue.toFixed(2))
    }));

    // Date label for display
    const formattedDate = targetDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    return res.status(200).json({
      Success: true,
      Message: 'Daily sales retrieved successfully.',
      Result: {
        date: formattedDate,
        totalBills,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalQuantitySold,
        paymentSummary
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Monthly Sales Report
 * Endpoint: GET /api/sales/monthly
 */
export const getMonthlySales = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month, 10) - 1 : now.getMonth(); // 0-indexed

    const start = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
    const end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const filter = buildSalesFilter(req);
    filter.saleDate = { $gte: start, $lte: end };

    const sales = await Sale.find(filter);

    const totalBills = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

    // Calculate total quantity sold
    const billIds = sales.map((s) => s.billId);
    const items = await BillItem.find({ billId: { $in: billIds } });
    const totalQuantitySold = items.reduce((sum, item) => sum + item.quantity, 0);

    // Month name
    const monthName = start.toLocaleString('default', { month: 'long' });

    // Daily breakdown for visual elegance (e.g. chart mapping)
    const dailyBreakdown = {};
    const daysInMonth = end.getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      dailyBreakdown[d] = 0;
    }

    sales.forEach((s) => {
      const day = new Date(s.saleDate).getDate();
      dailyBreakdown[day] += s.totalAmount;
    });

    const breakdown = Object.keys(dailyBreakdown).map((day) => ({
      day: parseInt(day, 10),
      revenue: parseFloat(dailyBreakdown[day].toFixed(2))
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Monthly sales retrieved successfully.',
      Result: {
        month: monthName,
        year: targetYear,
        totalBills,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalQuantitySold,
        dailyBreakdown: breakdown
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Yearly Sales Report
 * Endpoint: GET /api/sales/yearly
 */
export const getYearlySales = async (req, res, next) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

    const start = new Date(targetYear, 0, 1, 0, 0, 0, 0);
    const end = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const filter = buildSalesFilter(req);
    filter.saleDate = { $gte: start, $lte: end };

    const sales = await Sale.find(filter);

    const totalBills = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

    // Monthly breakdown (Months 1-12)
    const monthlyBreakdown = {};
    for (let m = 0; m < 12; m++) {
      monthlyBreakdown[m] = 0;
    }

    sales.forEach((s) => {
      const month = new Date(s.saleDate).getMonth();
      monthlyBreakdown[month] += s.totalAmount;
    });

    const breakdown = Object.keys(monthlyBreakdown).map((m) => {
      const dateObj = new Date(targetYear, parseInt(m, 10), 1);
      return {
        month: dateObj.toLocaleString('default', { month: 'short' }),
        revenue: parseFloat(monthlyBreakdown[m].toFixed(2))
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Yearly sales retrieved successfully.',
      Result: {
        year: targetYear,
        totalBills,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        monthlyBreakdown: breakdown
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Sales By Product
 * Endpoint: GET /api/sales/product
 */
export const getSalesByProduct = async (req, res, next) => {
  try {
    const filter = buildSalesFilter(req);
    const sales = await Sale.find(filter);
    const billIds = sales.map((s) => s.billId);

    // Retrieve all line items from completed bills
    const items = await BillItem.find({ billId: { $in: billIds } }).populate('productId');

    const productMap = {};
    items.forEach((item) => {
      if (!item.productId) return;
      const prodId = item.productId._id.toString();
      if (!productMap[prodId]) {
        productMap[prodId] = {
          productId: prodId,
          productCode: item.productId.productId || 'N/A',
          productName: item.productId.productName,
          barcode: item.productId.barcode,
          quantitySold: 0,
          revenue: 0
        };
      }
      productMap[prodId].quantitySold += item.quantity;
      productMap[prodId].revenue += item.total;
    });

    const result = Object.values(productMap).map((p) => ({
      ...p,
      revenue: parseFloat(p.revenue.toFixed(2))
    })).sort((a, b) => b.quantitySold - a.quantitySold); // Sort by highest quantity sold (best sellers)

    return res.status(200).json({
      Success: true,
      Message: 'Sales by product retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Sales By Staff / Cashier
 * Endpoint: GET /api/sales/staff
 */
export const getSalesByStaff = async (req, res, next) => {
  try {
    const filter = buildSalesFilter(req);
    const sales = await Sale.find(filter).populate({
      path: 'billId',
      populate: { path: 'userId' } // Populates cashier details
    });

    const staffMap = {};
    sales.forEach((sale) => {
      const bill = sale.billId;
      if (!bill || !bill.userId) return;
      const staffId = bill.userId._id.toString();
      if (!staffMap[staffId]) {
        staffMap[staffId] = {
          staffId,
          username: bill.userId.username || 'Unknown Staff',
          bills: 0,
          revenue: 0
        };
      }
      staffMap[staffId].bills += 1;
      staffMap[staffId].revenue += sale.totalAmount;
    });

    const result = Object.values(staffMap).map((s) => ({
      ...s,
      revenue: parseFloat(s.revenue.toFixed(2))
    })).sort((a, b) => b.revenue - a.revenue);

    return res.status(200).json({
      Success: true,
      Message: 'Sales by staff retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Sales By Category
 * Endpoint: GET /api/sales/category
 */
export const getSalesByCategory = async (req, res, next) => {
  try {
    const filter = buildSalesFilter(req);
    const sales = await Sale.find(filter);
    const billIds = sales.map((s) => s.billId);

    const items = await BillItem.find({ billId: { $in: billIds } }).populate({
      path: 'productId',
      populate: { path: 'categoryId' } // Populates product category details
    });

    const categoryMap = {};
    items.forEach((item) => {
      if (!item.productId || !item.productId.categoryId) return;
      const cat = item.productId.categoryId;
      const catId = cat._id.toString();
      if (!categoryMap[catId]) {
        categoryMap[catId] = {
          categoryId: catId,
          categoryName: cat.categoryName,
          revenue: 0
        };
      }
      categoryMap[catId].revenue += item.total;
    });

    const result = Object.values(categoryMap).map((c) => ({
      ...c,
      revenue: parseFloat(c.revenue.toFixed(2))
    })).sort((a, b) => b.revenue - a.revenue);

    return res.status(200).json({
      Success: true,
      Message: 'Sales by category retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7. Sales By Brand
 * Endpoint: GET /api/sales/brand
 */
export const getSalesByBrand = async (req, res, next) => {
  try {
    const filter = buildSalesFilter(req);
    const sales = await Sale.find(filter);
    const billIds = sales.map((s) => s.billId);

    const items = await BillItem.find({ billId: { $in: billIds } }).populate({
      path: 'productId',
      populate: { path: 'brandId' } // Populates product brand details
    });

    const brandMap = {};
    items.forEach((item) => {
      if (!item.productId || !item.productId.brandId) return;
      const brand = item.productId.brandId;
      const brandId = brand._id.toString();
      if (!brandMap[brandId]) {
        brandMap[brandId] = {
          brandId,
          brandName: brand.brandName,
          revenue: 0
        };
      }
      brandMap[brandId].revenue += item.total;
    });

    const result = Object.values(brandMap).map((b) => ({
      ...b,
      revenue: parseFloat(b.revenue.toFixed(2))
    })).sort((a, b) => b.revenue - a.revenue);

    return res.status(200).json({
      Success: true,
      Message: 'Sales by brand retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
