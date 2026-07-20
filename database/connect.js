/**
 * @file connect.js
 * @description Mongoose database connection setup.
 */

import mongoose from 'mongoose';

/**
 * Connect to MongoDB database
 */
const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);
    
    // Prioritize cloud database URI (DATABASE_URL) over local URI (MONGO_URI)
    const uri = process.env.DATABASE_URL || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/barcodeserver';
    
    // Mask password in logs to protect credentials
    const maskedUri = uri.replace(/:([^@:]+)@/, ':******@');
    console.log(`Connecting to MongoDB at: ${maskedUri}...`);

    const conn = await mongoose.connect(uri);
    console.log(`Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error('Could not connect to MongoDB... ' + error.message);
    process.exit(1);
  }
};

export default connectDB;
