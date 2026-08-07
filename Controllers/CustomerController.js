/**
 * @file CustomerController.js
 * @description Controller for Customer Management operations.
 */

import mongoose from 'mongoose';
import Customer from '../Models/Customer.js';
import Bill from '../Models/Bill.js';
import Invoice from '../Models/Invoice.js';

/**
 * 0. Get All Customers
 * Endpoint: GET /api/customers
 */
export const getAllCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      Success: true,
      Message: 'Customers retrieved successfully.',
      Result: customers.map((customer) => ({
        customerId: customer._id.toString(),
        customerName: customer.customerName,
        mobile: customer.mobile,
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      })),
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 1. Add Customer
 * Endpoint: POST /api/customers
 */
export const createCustomer = async (req, res, next) => {
  try {
    const { name, customerName, mobile, status } = req.body;
    const finalName = name || customerName;

    // Validate name and mobile presence
    if (!finalName) {
      return res.status(400).json({
        Success: false,
        Message: 'Customer name is required.',
        Result: null,
        StatusCode: 400
      });
    }

    if (!mobile) {
      return res.status(400).json({
        Success: false,
        Message: 'Mobile number is required.',
        Result: null,
        StatusCode: 400
      });
    }

    // Validate mobile format (10-digit)
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({
        Success: false,
        Message: 'Please enter a valid 10-digit mobile number.',
        Result: null,
        StatusCode: 400
      });
    }

    // Check duplicate mobile
    const existingCustomer = await Customer.findOne({ mobile, isDeleted: { $ne: true } });
    if (existingCustomer) {
      return res.status(409).json({
        Success: false,
        Message: 'A customer with this mobile number already exists.',
        Result: null,
        StatusCode: 409
      });
    }

    // Save Customer
    const customer = new Customer({
      customerName: finalName.trim(),
      mobile: mobile.trim(),
      status: status || 'active'
    });
    await customer.save();

    return res.status(201).json({
      Success: true,
      Message: 'Customer created successfully.',
      Result: {
        customerId: customer._id.toString(),
        customerName: customer.customerName,
        mobile: customer.mobile,
        status: customer.status,
        createdAt: customer.createdAt
      },
      StatusCode: 201
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Update Customer
 * Endpoint: PUT /api/customers/:customerId
 */
export const updateCustomer = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { name, customerName, mobile, status } = req.body;
    const finalName = name || customerName;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        Success: false,
        Message: 'Invalid Customer ID.',
        Result: null,
        StatusCode: 400
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        Success: false,
        Message: 'Customer not found.',
        Result: null,
        StatusCode: 404
      });
    }

    // Validation
    if (finalName !== undefined) {
      if (finalName.trim().length < 2) {
        return res.status(400).json({
          Success: false,
          Message: 'Customer name must be at least 2 characters long.',
          Result: null,
          StatusCode: 400
        });
      }
      customer.customerName = finalName.trim();
    }

    if (mobile !== undefined) {
      const mobileRegex = /^[0-9]{10}$/;
      if (!mobileRegex.test(mobile)) {
        return res.status(400).json({
          Success: false,
          Message: 'Please enter a valid 10-digit mobile number.',
          Result: null,
          StatusCode: 400
        });
      }

      // Check unique
      const duplicate = await Customer.findOne({
        _id: { $ne: customer._id },
        mobile,
        isDeleted: { $ne: true }
      });
      if (duplicate) {
        return res.status(409).json({
          Success: false,
          Message: 'Another customer with this mobile number already exists.',
          Result: null,
          StatusCode: 409
        });
      }
      customer.mobile = mobile.trim();
    }

    if (status !== undefined) {
      const allowedStatus = ['active', 'inactive'];
      if (!allowedStatus.includes(status.toLowerCase())) {
        return res.status(400).json({
          Success: false,
          Message: 'Invalid status. Allowed values: active, inactive',
          Result: null,
          StatusCode: 400
        });
      }
      customer.status = status.toLowerCase();
    }

    await customer.save();

    return res.status(200).json({
      Success: true,
      Message: 'Customer updated successfully.',
      Result: {
        customerId: customer._id.toString(),
        customerName: customer.customerName,
        mobile: customer.mobile,
        status: customer.status,
        updatedAt: customer.updatedAt
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Delete / Deactivate Customer
 * Endpoint: DELETE /api/customers/:customerId
 */
export const deleteCustomer = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        Success: false,
        Message: 'Invalid Customer ID.',
        Result: null,
        StatusCode: 400
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        Success: false,
        Message: 'Customer not found.',
        Result: null,
        StatusCode: 404
      });
    }

    // Check if customer has purchase history (Bills)
    const hasHistory = await Bill.countDocuments({ customerId: customer._id });

    if (hasHistory > 0) {
      // Soft delete: set status to inactive and mark isDeleted as true
      customer.status = 'inactive';
      await customer.softDelete();
      return res.status(200).json({
        Success: true,
        Message: 'Customer has purchase history. Customer deactivated and soft-deleted to preserve records.',
        Result: {
          customerId: customer._id.toString(),
          status: customer.status,
          isDeleted: customer.isDeleted
        },
        StatusCode: 200
      });
    } else {
      // Hard delete: no records exist
      await Customer.findByIdAndDelete(customerId);
      return res.status(200).json({
        Success: true,
        Message: 'Customer deleted permanently (no purchase history found).',
        Result: null,
        StatusCode: 200
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Get Customer Details
 * Endpoint: GET /api/customers/:customerId
 */
export const getCustomer = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(customerId)
      ? { $or: [{ _id: customerId }, { mobile: customerId }] }
      : { mobile: customerId };

    const customer = await Customer.findOne(query);
    if (!customer) {
      return res.status(404).json({
        Success: false,
        Message: 'Customer not found.',
        Result: null,
        StatusCode: 404
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Customer details retrieved successfully.',
      Result: {
        customerId: customer._id.toString(),
        customerName: customer.customerName,
        mobile: customer.mobile,
        registrationDate: customer.createdAt,
        status: customer.status
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4b. Get Customer by Phone Number
 * Endpoint: GET /api/customers/phone/:mobile
 */
export const getCustomerByPhoneNumber = async (req, res, next) => {
  try {
    const { mobile } = req.params;

    if (!/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({
        Success: false,
        Message: 'Please enter a valid 10-digit mobile number.',
        Result: null,
        StatusCode: 400
      });
    }

    const customer = await Customer.findOne({ mobile });
    if (!customer) {
      return res.status(404).json({
        Success: false,
        Message: 'Customer not found.',
        Result: null,
        StatusCode: 404
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Customer retrieved successfully.',
      Result: {
        customerId: customer._id.toString(),
        customerName: customer.customerName,
        mobile: customer.mobile,
        registrationDate: customer.createdAt,
        status: customer.status
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4c. Update Customer by Phone Number
 * Endpoint: PUT /api/customers/phone/:mobile
 */
export const updateCustomerByPhoneNumber = async (req, res, next) => {
  try {
    const { mobile } = req.params;
    const { name, customerName, newMobile, status } = req.body;
    const finalName = name || customerName;

    if (!/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({
        Success: false,
        Message: 'Please enter a valid 10-digit mobile number.',
        Result: null,
        StatusCode: 400
      });
    }

    const customer = await Customer.findOne({ mobile });
    if (!customer) {
      return res.status(404).json({
        Success: false,
        Message: 'Customer not found.',
        Result: null,
        StatusCode: 404
      });
    }

    if (finalName !== undefined) {
      if (finalName.trim().length < 2) {
        return res.status(400).json({
          Success: false,
          Message: 'Customer name must be at least 2 characters long.',
          Result: null,
          StatusCode: 400
        });
      }
      customer.customerName = finalName.trim();
    }

    if (newMobile !== undefined) {
      if (!/^[0-9]{10}$/.test(newMobile)) {
        return res.status(400).json({
          Success: false,
          Message: 'Please enter a valid 10-digit mobile number.',
          Result: null,
          StatusCode: 400
        });
      }

      const duplicate = await Customer.findOne({
        _id: { $ne: customer._id },
        mobile: newMobile,
        isDeleted: { $ne: true }
      });
      if (duplicate) {
        return res.status(409).json({
          Success: false,
          Message: 'Another customer with this mobile number already exists.',
          Result: null,
          StatusCode: 409
        });
      }

      customer.mobile = newMobile.trim();
    }

    if (status !== undefined) {
      const allowedStatus = ['active', 'inactive'];
      if (!allowedStatus.includes(status.toLowerCase())) {
        return res.status(400).json({
          Success: false,
          Message: 'Invalid status. Allowed values: active, inactive',
          Result: null,
          StatusCode: 400
        });
      }
      customer.status = status.toLowerCase();
    }

    await customer.save();

    return res.status(200).json({
      Success: true,
      Message: 'Customer updated successfully.',
      Result: {
        customerId: customer._id.toString(),
        customerName: customer.customerName,
        mobile: customer.mobile,
        status: customer.status,
        updatedAt: customer.updatedAt
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Get Customer Purchase History
 * Endpoint: GET /api/customers/:customerId/purchases
 */
export const getCustomerPurchaseHistory = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        Success: false,
        Message: 'Invalid Customer ID.',
        Result: null,
        StatusCode: 400
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        Success: false,
        Message: 'Customer not found.',
        Result: null,
        StatusCode: 404
      });
    }

    // Get all bills for this customer
    const bills = await Bill.find({ customerId: customer._id }).sort({ createdAt: -1 });
    const billIds = bills.map((b) => b._id);

    // Get all invoices associated with these bills
    const invoices = await Invoice.find({ billId: { $in: billIds } }).populate('billId');

    // Format list response
    const formattedHistory = invoices.map((inv) => {
      const bill = inv.billId;
      return {
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), // formatted e.g. "10-Jul"
        amount: bill ? bill.grandTotal : 0,
        paymentMethod: bill ? bill.paymentMethod : 'N/A'
      };
    });

    return res.status(200).json({
      Success: true,
      Message: 'Customer purchase history retrieved successfully.',
      Result: formattedHistory,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
