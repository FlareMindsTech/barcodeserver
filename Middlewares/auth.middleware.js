import jwt from 'jsonwebtoken';
import User from '../Models/User.js';
import BlacklistedToken from '../Models/BlacklistedToken.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        Success: false,
        Message: 'Authentication required. No token provided.',
        Result: null,
        StatusCode: 401
      });
    }

    const token = authHeader.split(' ')[1];

    // Check if token has been blacklisted
    const isBlacklisted = await BlacklistedToken.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({
        Success: false,
        Message: 'Invalid or expired token.',
        Result: null,
        StatusCode: 401
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
    
    // Fetch user from DB to verify existence and active status
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        Success: false,
        Message: 'User not found.',
        Result: null,
        StatusCode: 401
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        Success: false,
        Message: 'Access denied. Account is inactive.',
        Result: null,
        StatusCode: 403
      });
    }

    req.user = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      email: user.email
    };
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({
      Success: false,
      Message: 'Invalid or expired token.',
      Result: null,
      StatusCode: 401
    });
  }
};
