/**
 * @file upload.middleware.js
 * @description Multer configuration utilizing memory storage.
 */

import multer from 'multer';
import path from 'path';

// Use memory storage for direct upload streaming to cloud services
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const mimeType = allowedTypes.test(file.mimetype);
  const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimeType && extName) {
    return cb(null, true);
  }
  cb(new Error('Only JPG, JPEG, PNG and WEBP image formats are supported!'), false);
};

export const uploadProductImage = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});
