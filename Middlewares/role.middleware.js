export const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        Success: false,
        Message: 'Access denied. Role information missing.',
        Result: null,
        StatusCode: 403
      });
    }

    const userRole = req.user.role.trim();
    // Case-insensitive role comparison
    const hasRole = allowedRoles.some(role => role.toLowerCase() === userRole.toLowerCase());

    if (!hasRole) {
      return res.status(403).json({
        Success: false,
        Message: 'Access denied. You do not have permission to perform this action.',
        Result: null,
        StatusCode: 403
      });
    }

    next();
  };
};
