export const errorHandler = (err, req, res, next) => {
  console.error(err.stack || err);

  let statusCode = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  } else if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate key error: A record with this value already exists.';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired.';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid format for field ${err.path}: ${err.value}`;
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size is too large. Max limit is 5MB.';
    }
  }

  return res.status(statusCode).json({
    Success: false,
    Message: message,
    Result: null,
    StatusCode: statusCode
  });
};
