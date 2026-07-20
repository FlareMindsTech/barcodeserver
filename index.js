import express from 'express';
import dotenv from "dotenv";
import cors from "cors";
import productRouter from "./Routers/ProductRouter.js";
import authRouter from "./Routers/AuthRouter.js";
import userRouter from "./Routers/UserRouter.js";
import categoryRouter from "./Routers/CategoryRouter.js";
import brandRouter from "./Routers/BrandRouter.js";
import barcodeRouter from "./Routers/BarcodeRouter.js";
import factoryInventoryRouter from "./Routers/FactoryInventoryRouter.js";
import retailInventoryRouter from "./Routers/RetailInventoryRouter.js";
import stockTransferRouter from "./Routers/StockTransferRouter.js";
import billingRouter from "./Routers/BillingRouter.js";
import invoiceRouter from "./Routers/InvoiceRouter.js";
import customerRouter from "./Routers/CustomerRouter.js";
import salesRouter from "./Routers/SalesRouter.js";
import returnExchangeRouter from "./Routers/ReturnExchangeRouter.js";
import reportsRouter from "./Routers/ReportsRouter.js";
import settingsRouter from "./Routers/SettingsRouter.js";
import { requestLogger, errorHandler, notFoundHandler } from "./Middlewares/index.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Request Logger Middleware
app.use(requestLogger);

import connectDB from './database/connect.js';

// Connect Database
connectDB();

app.get("/", (req, res) => {
  res.send("welcome"); 
});

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/products", productRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/brands", brandRouter);
app.use("/api/barcodes", barcodeRouter);
app.use("/api/factory-inventory", factoryInventoryRouter);
app.use("/api/retail-inventory", retailInventoryRouter);
app.use("/api/stock-transfer", stockTransferRouter);
app.use("/api/billing", billingRouter);
app.use("/api/invoices", invoiceRouter);
app.use("/api/customers", customerRouter);
app.use("/api/sales", salesRouter);
app.use("/api", returnExchangeRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);

// Not Found Handler (404)
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 7800;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
