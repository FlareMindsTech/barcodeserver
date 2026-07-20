/**
 * @file AuthController.js
 * @description Controller for handling authentication requests (login, logout, refresh-token).
 */

import jwt from 'jsonwebtoken';
import User from '../Models/User.js';
import BlacklistedToken from '../Models/BlacklistedToken.js';

/**
 * Generate JWT access token for a user
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET || 'your-secret-key-here',
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

/**
 * User Login
 */
export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // 1. Validate username/password input in request body
    if (!username || !password) {
      return res.status(400).json({
        Success: false,
        Message: 'Username and password are required.',
        Result: null,
        StatusCode: 400
      });
    }

    // 2. Find user by username (case-insensitive, select password)
    const user = await User.findOne({ username: new RegExp('^' + username.trim() + '$', 'i') }).select('+password');
    if (!user) {
      return res.status(401).json({
        Success: false,
        Message: 'Invalid username or password.',
        Result: null,
        StatusCode: 401
      });
    }

    // 3. Verify account is active
    if (!user.isActive) {
      return res.status(401).json({
        Success: false,
        Message: 'Invalid username or password.', // Keep generic message for security, or 'Account is deactivated'
        Result: null,
        StatusCode: 401
      });
    }

    // 4. Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        Success: false,
        Message: 'Invalid username or password.',
        Result: null,
        StatusCode: 401
      });
    }

    // Update lastLogin timestamp
    user.lastLogin = new Date();
    await user.save();

    // 5. Generate JWT
    const token = generateToken(user);

    // 6. Return response in stable syntax
    return res.status(200).json({
      Success: true,
      Message: 'Login successful.',
      Result: {
        token,
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role
        }
      },
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User Logout (stateless, notify client to delete token)
 */
export const logout = async (req, res, next) => {
  try {
    const token = req.token;
    if (token) {
      const decoded = jwt.decode(token);
      const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await BlacklistedToken.findOneAndUpdate(
        { token },
        { token, expiresAt },
        { upsert: true, new: true }
      );
    }

    return res.status(200).json({
      Success: true,
      Message: 'Logout successful.',
      Result: null,
      StatusCode: 200
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh Token (optional flow)
 */
export const refreshToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        Success: false,
        Message: 'Refresh token authentication required.',
        Result: null,
        StatusCode: 401
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here', { ignoreExpiration: true });

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        Success: false,
        Message: 'Invalid token or inactive user.',
        Result: null,
        StatusCode: 401
      });
    }

    const newToken = generateToken(user);

    return res.status(200).json({
      Success: true,
      Message: 'Token refreshed successfully.',
      Result: {
        token: newToken
      },
      StatusCode: 200
    });
  } catch (error) {
    return res.status(401).json({
      Success: false,
      Message: 'Invalid or expired token.',
      Result: null,
      StatusCode: 401
    });
  }
};
