/**
 * @file BarcodeGenerator.js
 * @description Helper utility to generate EAN-13 compliant unique barcodes.
 */

import Product from '../Models/Product.js';

/**
 * Generate a unique EAN-13 barcode
 * EAN-13 consists of a 3-digit country code (e.g. 890 for India), 
 * 9 digits of data, and 1 checksum digit.
 */
export const generateUniqueBarcode = async () => {
  let unique = false;
  let barcode = '';
  
  while (!unique) {
    // FMT uses 890 prefix as sample country code
    const prefix = '890';
    // Generate 9 random digits
    let body = '';
    for (let i = 0; i < 9; i++) {
      body += Math.floor(Math.random() * 10).toString();
    }
    const rawBarcode = prefix + body;

    // Calculate EAN-13 Check Digit
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(rawBarcode[i], 10);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    barcode = rawBarcode + checkDigit;

    // Check uniqueness in database
    const existingProduct = await Product.findOne({ barcode });
    if (!existingProduct) {
      unique = true;
    }
  }

  return barcode;
};
