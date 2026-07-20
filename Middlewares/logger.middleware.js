export const requestLogger = (req, res, next) => {
  const start = Date.now();

  const getFormattedDate = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    const dateStr = getFormattedDate();
    const user = req.user ? (req.user.role || req.user.username || req.user.userId || 'Guest') : 'Guest';
    
    // Status text (e.g. "OK" for 200, "Created" for 201)
    const statusText = res.statusMessage || '';
    const statusStr = `${res.statusCode} ${statusText}`.trim();

    console.log(`${dateStr} ${req.method} ${req.originalUrl} ${user} ${statusStr} ${duration}ms`);
  });

  next();
};
