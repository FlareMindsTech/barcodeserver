/**
 * @file UserValidation.js
 * @description Input validation functions for User management and authentication.
 */

// Simple email regex pattern
const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

// Username pattern: only letters (capital and small), 3-50 chars
const USERNAME_REGEX = /^[a-zA-Z]{3,50}$/;

// Password strength pattern: minimum 6 characters, at least one uppercase letter, one lowercase letter, one number, and one special character
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

// Phone number pattern: E.164 format (e.g. +12345678901, or without +)
const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;

/**
 * Validate login input
 */
export const validateLogin = (body) => {
  if (!body.username) {
    return { status: false, message: 'Username is required.' };
  }
  if (!body.password) {
    return { status: false, message: 'Password is required.' };
  }
  return { status: true };
};

/**
 * Validate user creation input
 */
export const validateUserCreation = (body) => {

  if (!body.username) {
    return { status: false, message: 'Username is required.' };
  }
  if (!USERNAME_REGEX.test(body.username)) {
    return { 
      status: false, 
      message: 'Username must be 3-50 characters long and contain only letters (capital and small).' 
    };
  }

  if (!body.email) {
    return { status: false, message: 'Email is required.' };
  }
  if (!EMAIL_REGEX.test(body.email)) {
    return { status: false, message: 'Please enter a valid email address.' };
  }

  if (!body.phoneNumber) {
    return { status: false, message: 'Phone number is required.' };
  }
  if (!PHONE_REGEX.test(body.phoneNumber)) {
    return { status: false, message: 'Please enter a valid phone number.' };
  }

  if (!body.password) {
    return { status: false, message: 'Password is required.' };
  }
  if (!PASSWORD_REGEX.test(body.password)) {
    return { 
      status: false, 
      message: 'Password must be at least 6 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
    };
  }

  if (!body.role) {
    return { status: false, message: 'Role is required.' };
  }
  if (!['ADMIN', 'STOCK_MANAGER', 'STAFF'].includes(body.role)) {
    return { status: false, message: 'Invalid role. Must be ADMIN, STOCK_MANAGER, or STAFF.' };
  }

  return { status: true };
};

/**
 * Validate user update input (optional fields)
 */
export const validateUserUpdate = (body) => {
  const usernameToValidate = body.username !== undefined ? body.username : body.name;

  if (usernameToValidate !== undefined && !USERNAME_REGEX.test(usernameToValidate)) {
    return { 
      status: false, 
      message: 'Username must be 3-50 characters long and contain only letters (capital and small).' 
    };
  }

  if (body.email !== undefined && !EMAIL_REGEX.test(body.email)) {
    return { status: false, message: 'Please enter a valid email address.' };
  }

  if (body.phoneNumber !== undefined && !PHONE_REGEX.test(body.phoneNumber)) {
    return { status: false, message: 'Please enter a valid phone number.' };
  }

  if (body.role !== undefined && !['ADMIN', 'STOCK_MANAGER', 'STAFF'].includes(body.role)) {
    return { status: false, message: 'Invalid role. Must be ADMIN, STOCK_MANAGER, or STAFF.' };
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return { status: false, message: 'isActive must be a boolean value.' };
  }

  return { status: true };
};

/**
 * Validate password change input
 */
export const validatePasswordChange = (body) => {
  if (!body.username) {
    return { status: false, message: 'Username is required.' };
  }
  if (!body.password) {
    return { status: false, message: 'Password is required.' };
  }
  if (!PASSWORD_REGEX.test(body.password)) {
    return { 
      status: false, 
      message: 'Password must be at least 6 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
    };
  }
  return { status: true };
};
