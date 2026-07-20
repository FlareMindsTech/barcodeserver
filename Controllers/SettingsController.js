/**
 * @file SettingsController.js
 * @description Controller for global store settings and configurations.
 */

import mongoose from 'mongoose';
import Settings from '../Models/Settings.js';

/**
 * Helper to retrieve or initialize the single configuration document.
 */
const getOrCreateSettings = async (userId = null) => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = new Settings({
      shopName: 'FlareMinds Apparel Outlet',
      shopAddress: 'Plot 45, Textile Hub, Surat, Gujarat, 395003',
      gstNumber: '24ABCDE1234F1Z5',
      gstPercentage: 18,
      defaultDiscount: 0,
      invoicePrefix: 'INV-',
      currency: 'INR',
      contactNumber: '+919876543210',
      updatedBy: userId
    });
    await settings.save();
  }
  return settings;
};

/**
 * 1. Get Settings
 * Endpoint: GET /api/settings
 */
export const getSettings = async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();

    // Map fields for client display compatibility (including both gst and gstPercentage)
    const result = {
      shopName: settings.shopName,
      shopAddress: settings.shopAddress,
      address: settings.shopAddress, // compatible alias
      gstNumber: settings.gstNumber,
      gst: settings.gstPercentage, // mapped from gstPercentage
      gstPercentage: settings.gstPercentage,
      defaultDiscount: settings.defaultDiscount,
      invoicePrefix: settings.invoicePrefix,
      currency: settings.currency,
      contactNumber: settings.contactNumber,
      phone: settings.contactNumber, // compatible alias
      updatedAt: settings.updatedAt
    };

    return res.status(200).json({
      Success: true,
      Message: 'Settings retrieved successfully.',
      Result: result,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Update GST Percentage
 * Endpoint: PUT /api/settings/gst
 */
export const updateGst = async (req, res, next) => {
  try {
    const { gstPercentage, gst } = req.body;
    const finalGst = gstPercentage !== undefined ? gstPercentage : gst;
    const userId = req.user.userId;

    if (finalGst === undefined || typeof finalGst !== 'number' || finalGst < 0 || finalGst > 100) {
      return res.status(400).json({
        Success: false,
        Message: 'Please enter a valid GST percentage between 0 and 100.',
        Result: null,
        StatusCode: 400
      });
    }

    const settings = await getOrCreateSettings(userId);
    settings.gstPercentage = finalGst;
    settings.updatedBy = userId;
    await settings.save();

    return res.status(200).json({
      Success: true,
      Message: 'GST configuration updated successfully.',
      Result: {
        gstPercentage: settings.gstPercentage,
        gst: settings.gstPercentage
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Update Default Discount
 * Endpoint: PUT /api/settings/discount
 */
export const updateDiscount = async (req, res, next) => {
  try {
    const { defaultDiscount } = req.body;
    const userId = req.user.userId;

    if (defaultDiscount === undefined || typeof defaultDiscount !== 'number' || defaultDiscount < 0 || defaultDiscount > 100) {
      return res.status(400).json({
        Success: false,
        Message: 'Please enter a valid discount percentage between 0 and 100.',
        Result: null,
        StatusCode: 400
      });
    }

    const settings = await getOrCreateSettings(userId);
    settings.defaultDiscount = defaultDiscount;
    settings.updatedBy = userId;
    await settings.save();

    return res.status(200).json({
      Success: true,
      Message: 'Discount rules updated successfully.',
      Result: {
        defaultDiscount: settings.defaultDiscount
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Update Invoice Prefix
 * Endpoint: PUT /api/settings/invoice-prefix
 */
export const updateInvoicePrefix = async (req, res, next) => {
  try {
    const { invoicePrefix } = req.body;
    const userId = req.user.userId;

    if (!invoicePrefix || typeof invoicePrefix !== 'string' || invoicePrefix.trim().length === 0) {
      return res.status(400).json({
        Success: false,
        Message: 'Invoice prefix is required and must be a valid string.',
        Result: null,
        StatusCode: 400
      });
    }

    if (invoicePrefix.trim().length > 10) {
      return res.status(400).json({
        Success: false,
        Message: 'Invoice prefix cannot exceed 10 characters.',
        Result: null,
        StatusCode: 400
      });
    }

    const settings = await getOrCreateSettings(userId);
    // Strip trailing dashes if any, to format prefix uniformly as PREFIX-
    settings.invoicePrefix = invoicePrefix.trim().replace(/-$/, '') + '-';
    settings.updatedBy = userId;
    await settings.save();

    return res.status(200).json({
      Success: true,
      Message: 'Invoice prefix updated successfully.',
      Result: {
        invoicePrefix: settings.invoicePrefix.replace(/-$/, '')
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Update Shop Information
 * Endpoint: PUT /api/settings/shop
 */
export const updateShopInfo = async (req, res, next) => {
  try {
    const { shopName, shopAddress, address, phone, contactNumber, gstNumber } = req.body;
    const userId = req.user.userId;

    const finalAddress = shopAddress || address;
    const finalPhone = contactNumber || phone;

    const settings = await getOrCreateSettings(userId);

    if (shopName !== undefined) {
      if (typeof shopName !== 'string' || shopName.trim().length === 0) {
        return res.status(400).json({
          Success: false,
          Message: 'Shop name is required.',
          Result: null,
          StatusCode: 400
        });
      }
      settings.shopName = shopName.trim();
    }

    if (finalAddress !== undefined) {
      if (typeof finalAddress !== 'string' || finalAddress.trim().length === 0) {
        return res.status(400).json({
          Success: false,
          Message: 'Shop address is required.',
          Result: null,
          StatusCode: 400
        });
      }
      settings.shopAddress = finalAddress.trim();
    }

    if (finalPhone !== undefined) {
      settings.contactNumber = finalPhone.trim();
    }

    if (gstNumber !== undefined) {
      // Validate Indian GSTIN format
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (gstNumber.trim().length > 0 && !gstRegex.test(gstNumber.trim().toUpperCase())) {
        return res.status(400).json({
          Success: false,
          Message: 'Please enter a valid 15-character GSTIN number (e.g. 24ABCDE1234F1Z5).',
          Result: null,
          StatusCode: 400
        });
      }
      settings.gstNumber = gstNumber.trim().toUpperCase();
    }

    settings.updatedBy = userId;
    await settings.save();

    return res.status(200).json({
      Success: true,
      Message: 'Shop information updated successfully.',
      Result: {
        shopName: settings.shopName,
        shopAddress: settings.shopAddress,
        contactNumber: settings.contactNumber,
        gstNumber: settings.gstNumber
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
