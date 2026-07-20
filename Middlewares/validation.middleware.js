export const validateRequest = (validationFn) => {
  return (req, res, next) => {
    const result = validationFn(req.body);
    if (result && result.status === false) {
      return res.status(400).json({
        Success: false,
        Message: result.message,
        Result: null,
        StatusCode: 400
      });
    }
    next();
  };
};
