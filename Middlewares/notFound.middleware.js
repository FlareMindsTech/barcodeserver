export const notFoundHandler = (req, res, next) => {
  return res.status(404).json({
    Success: false,
    Message: 'API Not Found',
    Result: null,
    StatusCode: 404
  });
};
