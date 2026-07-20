/**
 * @file ReportsController.js
 * @description Controller for Reports & Analytics operations.
 */

import mongoose from 'mongoose';
import Sale from '../Models/Sale.js';
import Bill from '../Models/Bill.js';
import BillItem from '../Models/BillItem.js';
import Product from '../Models/Product.js';
import FactoryInventory from '../Models/FactoryInventory.js';
import RetailInventory from '../Models/RetailInventory.js';
import StockTransfer from '../Models/StockTransfer.js';
import Return from '../Models/Return.js';

/**
 * Helper to parse date range from query params
 */
const parseDateRange = (req, defaultDays = 30) => {
  const { startDate, endDate, from, to } = req.query;
  const startStr = startDate || from;
  const endStr = endDate || to;

  let start, end;
  if (startStr) {
    start = new Date(startStr);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date();
    start.setDate(start.getDate() - defaultDays);
    start.setHours(0, 0, 0, 0);
  }

  if (endStr) {
    end = new Date(endStr);
    end.setHours(23, 59, 59, 999);
  } else {
    end = new Date();
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

/**
 * Helper to aggregate factory stock levels for all products
 */
const getFactoryStocks = async () => {
  const factoryStockList = await FactoryInventory.aggregate([
    {
      $group: {
        _id: '$productId',
        totalStock: {
          $sum: {
            $cond: [
              { $eq: ['$movementType', 'inward'] },
              '$quantity',
              {
                $cond: [
                  { $eq: ['$movementType', 'outward'] },
                  { $subtract: [0, '$quantity'] },
                  '$quantity' // adjustment delta
                ]
              }
            ]
          }
        }
      }
    }
  ]);

  const stockMap = {};
  factoryStockList.forEach((item) => {
    stockMap[item._id.toString()] = item.totalStock;
  });
  return stockMap;
};

/**
 * 1. Dashboard Summary
 * Endpoint: GET /api/reports/dashboard
 */
export const getDashboardSummary = async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Today's Sales
    const todaySales = await Sale.find({ saleDate: { $gte: todayStart, $lte: todayEnd } });
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const todayBills = todaySales.length;

    // Total Revenue & Bills (All time)
    const allSales = await Sale.find({});
    const totalRevenue = allSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalBills = allSales.length;

    // Factory Stock
    const factoryStockMap = await getFactoryStocks();
    const totalFactoryStock = Object.values(factoryStockMap).reduce((sum, qty) => sum + Math.max(0, qty), 0);

    // Retail Stock
    const retailStocks = await RetailInventory.find({});
    const totalRetailStock = retailStocks.reduce((sum, r) => sum + r.quantity, 0);

    // Low Stock Products Count (Retail Stock <= Minimum Stock)
    const lowStockCount = await RetailInventory.countDocuments({
      $expr: { $lte: ['$quantity', '$minimumStock'] }
    });

    // Best Selling Products (Top 5)
    const billIds = allSales.map((s) => s.billId);
    const bestSellersAgg = await BillItem.aggregate([
      { $match: { billId: { $in: billIds } } },
      { $group: { _id: '$productId', quantitySold: { $sum: '$quantity' } } },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 }
    ]);

    // Populate best seller details
    const bestSellingProducts = [];
    for (const item of bestSellersAgg) {
      if (item._id) {
        const product = await Product.findById(item._id);
        if (product) {
          bestSellingProducts.push({
            productId: product.productId || product._id.toString(),
            productName: product.productName,
            quantitySold: item.quantitySold
          });
        }
      }
    }

    return res.status(200).json({
      Success: true,
      Message: 'Dashboard summary retrieved successfully.',
      Result: {
        todayRevenue: parseFloat(todayRevenue.toFixed(2)),
        todayBills,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalBills,
        totalFactoryStock,
        totalRetailStock,
        lowStockProductsCount: lowStockCount,
        bestSellingProducts
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Sales Report
 * Endpoint: GET /api/reports/sales
 */
export const getSalesReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req);

    const sales = await Sale.find({ saleDate: { $gte: start, $lte: end } }).sort({ saleDate: 1 });

    const totalBills = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

    // Calculate total quantity sold
    const billIds = sales.map((s) => s.billId);
    const items = await BillItem.find({ billId: { $in: billIds } });
    const totalQuantitySold = items.reduce((sum, item) => sum + item.quantity, 0);

    // Group sales by day
    const dailyBreakdown = {};
    sales.forEach((s) => {
      const dateStr = s.saleDate.toISOString().split('T')[0];
      if (!dailyBreakdown[dateStr]) {
        dailyBreakdown[dateStr] = { date: dateStr, bills: 0, revenue: 0 };
      }
      dailyBreakdown[dateStr].bills += 1;
      dailyBreakdown[dateStr].revenue += s.totalAmount;
    });

    const breakdown = Object.values(dailyBreakdown).map((d) => ({
      ...d,
      revenue: parseFloat(d.revenue.toFixed(2))
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Sales report retrieved successfully.',
      Result: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        },
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
 * 3. Inventory Report
 * Endpoint: GET /api/reports/inventory
 */
export const getInventoryReport = async (req, res, next) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true } });
    const totalProducts = products.length;

    // Factory stock total
    const factoryStockMap = await getFactoryStocks();
    let totalFactoryStock = 0;

    // Retail stock total
    const retailStocks = await RetailInventory.find({});
    const retailStockMap = {};
    let totalRetailStock = 0;

    retailStocks.forEach((r) => {
      retailStockMap[r.productId.toString()] = r.quantity;
      totalRetailStock += r.quantity;
    });

    // Calculate total inventory value
    let totalStockValue = 0;
    products.forEach((p) => {
      const fStock = factoryStockMap[p._id.toString()] || 0;
      const rStock = retailStockMap[p._id.toString()] || 0;
      const totalStock = Math.max(0, fStock) + Math.max(0, rStock);
      totalStockValue += totalStock * p.mrp;
      
      if (fStock > 0) {
        totalFactoryStock += fStock;
      }
    });

    return res.status(200).json({
      Success: true,
      Message: 'Inventory report retrieved successfully.',
      Result: {
        totalProducts,
        totalFactoryStock,
        totalRetailStock,
        totalStockValue: parseFloat(totalStockValue.toFixed(2))
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Factory Inventory Report
 * Endpoint: GET /api/reports/factory-inventory
 */
export const getFactoryInventoryReport = async (req, res, next) => {
  try {
    const factoryStockMap = await getFactoryStocks();
    const totalFactoryStock = Object.values(factoryStockMap).reduce((sum, qty) => sum + Math.max(0, qty), 0);

    // Recently Produced Products (Last 10 production entries)
    const productionMovements = await FactoryInventory.find({ remarks: 'Production' })
      .populate('productId')
      .sort({ lastUpdated: -1 })
      .limit(10);

    const recentlyProduced = productionMovements.map((m) => ({
      date: m.lastUpdated,
      productName: m.productId ? m.productId.productName : 'Unknown Product',
      quantity: m.quantity
    }));

    // Recent Warehouse Movements
    const allMovements = await FactoryInventory.find({})
      .populate('productId')
      .sort({ lastUpdated: -1 })
      .limit(20);

    const movements = allMovements.map((m) => ({
      date: m.lastUpdated,
      productName: m.productId ? m.productId.productName : 'Unknown Product',
      quantity: m.quantity,
      movementType: m.movementType,
      remarks: m.remarks
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Factory inventory report retrieved successfully.',
      Result: {
        currentFactoryStock: totalFactoryStock,
        recentlyProduced,
        factoryStockMovements: movements
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Retail Inventory Report
 * Endpoint: GET /api/reports/retail-inventory
 */
export const getRetailInventoryReport = async (req, res, next) => {
  try {
    const retailStocks = await RetailInventory.find({}).populate('productId');
    const totalRetailStock = retailStocks.reduce((sum, r) => sum + r.quantity, 0);

    // Recently Sold Products (Last 10 distinct products sold from paid bills)
    const recentSales = await Sale.find({}).sort({ saleDate: -1 }).limit(10);
    const billIds = recentSales.map((s) => s.billId);

    const soldItems = await BillItem.find({ billId: { $in: billIds } })
      .populate('productId')
      .sort({ createdAt: -1 })
      .limit(10);

    const recentlySold = soldItems.map((item) => ({
      date: item.createdAt,
      productName: item.productId ? item.productId.productName : 'Unknown Product',
      quantity: item.quantity,
      price: item.price
    }));

    const stockSummary = retailStocks.map((item) => ({
      productId: item.productId ? (item.productId.productId || item.productId._id.toString()) : 'N/A',
      productName: item.productId ? item.productId.productName : 'Unknown Product',
      quantity: item.quantity,
      minimumStock: item.minimumStock,
      stockStatus: item.stockStatus
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Retail inventory report retrieved successfully.',
      Result: {
        availableRetailStock: totalRetailStock,
        recentlySold,
        retailStockSummary: stockSummary
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Stock Transfer Report
 * Endpoint: GET /api/reports/stock-transfer
 */
export const getStockTransferReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req);

    const transfers = await StockTransfer.find({
      transferDate: { $gte: start, $lte: end }
    }).populate('productId').populate('transferredBy').sort({ transferDate: -1 });

    const factoryToRetail = [];
    const factoryToOnline = [];

    transfers.forEach((t) => {
      const formatted = {
        date: t.transferDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        product: t.productId ? t.productId.productName : 'Unknown Product',
        destination: t.toLocation,
        quantity: t.quantity,
        status: t.status,
        transferredBy: t.transferredBy ? t.transferredBy.username : 'System'
      };

      if (t.toLocation.toLowerCase().includes('online') || t.toLocation.toLowerCase().includes('dispatch')) {
        factoryToOnline.push(formatted);
      } else {
        factoryToRetail.push(formatted);
      }
    });

    return res.status(200).json({
      Success: true,
      Message: 'Stock transfer report retrieved successfully.',
      Result: {
        factoryToRetailTransfers: factoryToRetail,
        factoryToOnlineDispatches: factoryToOnline
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7. GST Report
 * Endpoint: GET /api/reports/gst
 */
export const getGstReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req);

    // Get completed bills within date range
    const bills = await Bill.find({
      createdAt: { $gte: start, $lte: end },
      paymentStatus: 'paid'
    }).sort({ createdAt: -1 });

    let totalGstCollected = 0;
    const invoiceWiseGst = [];
    const dateWiseGstMap = {};
    const rateWiseGstMap = {};

    for (const bill of bills) {
      // Find matching invoice
      const invoice = await Invoice.findOne({ billId: bill._id });
      const invoiceNum = invoice ? invoice.invoiceNumber : `BILL-${bill.billNumber}`;

      // GST calculations for invoice
      totalGstCollected += bill.gstAmount;

      invoiceWiseGst.push({
        invoiceNumber: invoiceNum,
        date: bill.createdAt.toISOString().split('T')[0],
        subtotal: bill.subtotal,
        gstCollected: parseFloat(bill.gstAmount.toFixed(2)),
        grandTotal: bill.grandTotal
      });

      // Date-wise grouping
      const dateStr = bill.createdAt.toISOString().split('T')[0];
      if (!dateWiseGstMap[dateStr]) {
        dateWiseGstMap[dateStr] = 0;
      }
      dateWiseGstMap[dateStr] += bill.gstAmount;

      // Rate-wise grouping from BillItems
      const items = await BillItem.find({ billId: bill._id }).populate('productId');
      items.forEach((item) => {
        const gstRate = item.productId ? item.productId.gst : 0;
        const rateLabel = `${gstRate}%`;
        if (!rateWiseGstMap[rateLabel]) {
          rateWiseGstMap[rateLabel] = 0;
        }
        // Calculate tax portion for this specific item
        // Net value * gstRate / 100
        const itemTax = item.total - (item.total / (1 + gstRate / 100));
        rateWiseGstMap[rateLabel] += itemTax;
      });
    }

    const dateWiseGst = Object.keys(dateWiseGstMap).map((date) => ({
      date,
      gstCollected: parseFloat(dateWiseGstMap[date].toFixed(2))
    }));

    const rateWiseGst = Object.keys(rateWiseGstMap).map((rate) => ({
      gstRate: rate,
      gstCollected: parseFloat(rateWiseGstMap[rate].toFixed(2))
    }));

    return res.status(200).json({
      Success: true,
      Message: 'GST report retrieved successfully.',
      Result: {
        totalGstCollected: parseFloat(totalGstCollected.toFixed(2)),
        gstPercentageSummary: rateWiseGst,
        invoiceWiseGst,
        dateWiseGst
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 8. Profit Report
 * Endpoint: GET /api/reports/profit
 */
export const getProfitReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req);

    // Get completed sales
    const sales = await Sale.find({ saleDate: { $gte: start, $lte: end } });
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

    const billIds = sales.map((s) => s.billId);
    const items = await BillItem.find({ billId: { $in: billIds } }).populate('productId');

    let totalCost = 0;
    let isCostDataComplete = true;

    items.forEach((item) => {
      const product = item.productId;
      if (product) {
        // If product cost price is defined in schema
        if (product.costPrice !== undefined && product.costPrice !== null) {
          totalCost += product.costPrice * item.quantity;
        } else {
          isCostDataComplete = false;
          // Fallback heuristic: assume a default 60% of MRP as product cost for estimation
          totalCost += (product.mrp * 0.6) * item.quantity;
        }
      } else {
        isCostDataComplete = false;
      }
    });

    const grossProfit = totalRevenue - totalCost;
    const profitPercentage = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return res.status(200).json({
      Success: true,
      Message: isCostDataComplete
        ? 'Profit report retrieved successfully.'
        : 'Profit report contains estimated costs. Some products are missing cost pricing.',
      Result: {
        revenue: parseFloat(totalRevenue.toFixed(2)),
        productCost: parseFloat(totalCost.toFixed(2)),
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        profitPercentage: parseFloat(profitPercentage.toFixed(2)),
        isCostDataComplete
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 9. Low Stock Report
 * Endpoint: GET /api/reports/low-stock
 */
export const getLowStockReport = async (req, res, next) => {
  try {
    const lowStockItems = await RetailInventory.find({
      $expr: { $lte: ['$quantity', '$minimumStock'] }
    }).populate('productId');

    const result = lowStockItems.map((item) => ({
      productCode: item.productId ? (item.productId.productId || item.productId._id.toString()) : 'N/A',
      productName: item.productId ? item.productId.productName : 'Unknown Product',
      currentStock: item.quantity,
      minimumStock: item.minimumStock,
      stockStatus: item.stockStatus
    }));

    return res.status(200).json({
      Success: true,
      Message: 'Low stock report retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 10. Best Selling Products Report
 * Endpoint: GET /api/reports/best-selling
 */
export const getBestSellingReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req);

    const sales = await Sale.find({ saleDate: { $gte: start, $lte: end } });
    const billIds = sales.map((s) => s.billId);

    const bestSellersAgg = await BillItem.aggregate([
      { $match: { billId: { $in: billIds } } },
      { $group: { _id: '$productId', quantitySold: { $sum: '$quantity' }, revenue: { $sum: '$total' } } },
      { $sort: { quantitySold: -1 } }
    ]);

    const result = [];
    for (const item of bestSellersAgg) {
      if (item._id) {
        const product = await Product.findById(item._id);
        if (product) {
          result.push({
            productId: product.productId || product._id.toString(),
            productName: product.productName,
            barcode: product.barcode,
            quantitySold: item.quantitySold,
            revenue: parseFloat(item.revenue.toFixed(2))
          });
        }
      }
    }

    return res.status(200).json({
      Success: true,
      Message: 'Best selling report retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
