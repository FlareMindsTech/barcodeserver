/**
 * @file UserController.js
 * @description Controller for executing User operations (CRUD, password resets, profile viewing).
 */

import User from '../Models/User.js';
import {
  validateUserCreation,
  validateUserUpdate,
  validatePasswordChange
} from '../Helpers/UserValidation.js';

/**
 * Create a new user (Admin only)
 */
export const createUser = async (req, res, next) => {
  try {
    // 1. Validate request body
    const validation = validateUserCreation(req.body);
    if (!validation.status) {
      return res.status(400).json({
        Success: false,
        Message: validation.message,
        Result: null,
        StatusCode: 400
      });
    }

    const { username, email, phoneNumber, password, role } = req.body;
    const cleanUsername = username.trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phoneNumber.trim();

    // 2. Check duplicate username
    const existingUsername = await User.findOne({ username: new RegExp('^' + cleanUsername + '$', 'i') });
    if (existingUsername) {
      return res.status(400).json({
        Success: false,
        Message: 'Username already exists.',
        Result: null,
        StatusCode: 400
      });
    }

    // 3. Check duplicate email
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({
        Success: false,
        Message: 'Email already exists.',
        Result: null,
        StatusCode: 400
      });
    }

    // Check duplicate phone number
    const existingPhone = await User.findOne({ phoneNumber: cleanPhone });
    if (existingPhone) {
      return res.status(400).json({
        Success: false,
        Message: 'Phone number already exists.',
        Result: null,
        StatusCode: 400
      });
    }

    // 4. Save user (password hashing is handled in User model pre-save hook)
    const newUser = new User({
      username: cleanUsername,
      email: cleanEmail,
      phoneNumber: cleanPhone,
      password,
      role
    });

    await newUser.save();

    // 5. Return created user
    return res.status(201).json({
      Success: true,
      Message: 'User created successfully.',
      Result: {
        id: newUser._id.toString(),
        username: newUser.username,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt
      },
      StatusCode: 201
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users (Admin only)
 */
export const getAllUsers = async (req, res, next) => {
  try {
    console.log("hello");
    const users = await User.find({}).sort({ createdAt: -1 });
    console.log("hello");
    return res.status(200).json({
      Success: true,
      Message: 'Users retrieved successfully.',
      Result: users,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID (Admin only)
 */
export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        Success: false,
        Message: 'User not found.',
        Result: null,
        StatusCode: 404
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'User retrieved successfully.',
      Result: user,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user details (Admin only)
 */
export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Authorization check: Admin can update any user. Non-admins can only update themselves.
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      return res.status(403).json({
        Success: false,
        Message: 'Access denied. You can only update your own profile.',
        Result: null,
        StatusCode: 403
      });
    }

    // 1. Find user
    const user = await User.findById(id).select('+password');
    if (!user) {
      return res.status(404).json({
        Success: false,
        Message: 'User not found.',
        Result: null,
        StatusCode: 404
      });
    }

    // 2. Validate update fields
    const validation = validateUserUpdate(req.body);
    if (!validation.status) {
      return res.status(400).json({
        Success: false,
        Message: validation.message,
        Result: null,
        StatusCode: 400
      });
    }

    const { username, name, email, phoneNumber, role, isActive } = req.body;
    const inputUsername = username !== undefined ? username : name;

    // Non-admins cannot update role or isActive status
    if (req.user.role !== 'ADMIN') {
      if (role !== undefined && role !== user.role) {
        return res.status(403).json({
          Success: false,
          Message: 'Access denied. Only administrators can change roles.',
          Result: null,
          StatusCode: 403
        });
      }
      if (isActive !== undefined && isActive !== user.isActive) {
        return res.status(403).json({
          Success: false,
          Message: 'Access denied. Only administrators can activate or deactivate accounts.',
          Result: null,
          StatusCode: 403
        });
      }
    }

    // 3. Check duplicate username if updated
    if (inputUsername !== undefined) {
      const cleanUsername = inputUsername.trim();
      if (cleanUsername !== user.username) {
        const existingUsername = await User.findOne({
          username: new RegExp('^' + cleanUsername + '$', 'i'),
          _id: { $ne: id }
        });
        if (existingUsername) {
          return res.status(400).json({
            Success: false,
            Message: 'Username already exists.',
            Result: null,
            StatusCode: 400
          });
        }
        user.username = cleanUsername;
      }
    }

    // 4. Check duplicate email if updated
    if (email !== undefined) {
      const cleanEmail = email.toLowerCase().trim();
      if (cleanEmail !== user.email) {
        const existingEmail = await User.findOne({ email: cleanEmail });
        if (existingEmail) {
          return res.status(400).json({
            Success: false,
            Message: 'Email already exists.',
            Result: null,
            StatusCode: 400
          });
        }
        user.email = cleanEmail;
      }
    }

    // Check duplicate phone number if updated
    if (phoneNumber !== undefined) {
      const cleanPhone = phoneNumber.trim();
      if (cleanPhone !== user.phoneNumber) {
        const existingPhone = await User.findOne({ phoneNumber: cleanPhone });
        if (existingPhone) {
          return res.status(400).json({
            Success: false,
            Message: 'Phone number already exists.',
            Result: null,
            StatusCode: 400
          });
        }
        user.phoneNumber = cleanPhone;
      }
    }

    // 5. Update other fields
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    return res.status(200).json({
      Success: true,
      Message: 'User updated successfully.',
      Result: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isActive: user.isActive,
        updatedAt: user.updatedAt
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user - Soft delete (Admin only)
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('+password');
    if (!user) {
      return res.status(404).json({
        Success: false,
        Message: 'User not found.',
        Result: null,
        StatusCode: 404
      });
    }

    // Prevent deleting oneself
    if (req.user.userId === id) {
      return res.status(400).json({
        Success: false,
        Message: 'Access denied. You cannot delete your own admin account.',
        Result: null,
        StatusCode: 400
      });
    }

    await user.softDelete();

    return res.status(200).json({
      Success: true,
      Message: 'User deleted successfully.',
      Result: null,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change or Reset password (Admin only)
 */
export const changePassword = async (req, res, next) => {
  try {
    // Ensure only Admin can change passwords
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        Success: false,
        Message: 'Access denied. Only administrators can change passwords.',
        Result: null,
        StatusCode: 403
      });
    }

    // 1. Validate request
    const validation = validatePasswordChange(req.body);
    if (!validation.status) {
      return res.status(400).json({
        Success: false,
        Message: validation.message,
        Result: null,
        StatusCode: 400
      });
    }

    const { username, password } = req.body;
    const cleanUsername = username.trim();

    // 2. Find target user by username
    const user = await User.findOne({ username: new RegExp('^' + cleanUsername + '$', 'i') });
    if (!user) {
      return res.status(404).json({
        Success: false,
        Message: 'User not found.',
        Result: null,
        StatusCode: 404
      });
    }

    // 3. Set and save password (hashed automatically via hook)
    user.password = password;
    await user.save();

    return res.status(200).json({
      Success: true,
      Message: 'Password updated successfully.',
      Result: null,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get profile details (Authenticated self only)
 */
export const getProfile = async (req, res, next) => {
  try {
    // Authenticated user's ID is attached to req.user in the authenticate middleware
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        Success: false,
        Message: 'User not found.',
        Result: null,
        StatusCode: 404
      });
    }

    return res.status(200).json({
      Success: true,
      Message: 'Profile retrieved successfully.',
      Result: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};
