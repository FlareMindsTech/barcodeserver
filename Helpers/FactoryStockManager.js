/**
 * @file FactoryStockManager.js
 * @description Single source of truth for the factory (warehouse) stock balance.
 *
 * The FactoryInventory collection is an append-only MOVEMENT ledger, which two
 * concurrent "read ledger, compute balance, then write a new movement" flows
 * can both pass — neither sees the other's pending write — so the ledger alone
 * cannot enforce non-negative stock. The authoritative current balance lives on
 * the Product document (`factoryStock`) and is changed ONLY through atomic
 * guarded operations here:
 *
 *   addFactoryStock    -> $inc (no guard; stock only grows)
 *   deductFactoryStock -> findOneAndUpdate guarded on factoryStock >= qty, so a
 *                         second concurrent dispatch simply returns null and the
 *                         caller aborts instead of overdrawing.
 *   setFactoryStock    -> absolute set for operator-driven manual corrections.
 *
 * Legacy deployments that only have ledger movements get backfilled on boot
 * (syncAllFactoryStocks) and lazily per-product if a balance is ever missing.
 */

import Product from '../Models/Product.js';
import FactoryInventory from '../Models/FactoryInventory.js';

/**
 * Read the authoritative factory balance for a product.
 * @returns {Promise<number|null>} balance, or null when the product is missing.
 */
export const getFactoryStock = async (productId) => {
  const product = await Product.findById(productId).select('factoryStock');
  if (!product) {
    return null;
  }

  if (typeof product.factoryStock === 'number' && product.factoryStock >= 0) {
    return product.factoryStock;
  }

  // Lazy backfill for records written before the balance field existed.
  const aggregate = await FactoryInventory.aggregate([
    { $match: { productId } },
    { $group: { _id: null, total: { $sum: '$quantity' } } }
  ]);
  const balance = aggregate.length > 0 ? aggregate[0].total : 0;

  await Product.updateOne({ _id: productId }, { $set: { factoryStock: Math.max(0, balance) } });
  return Math.max(0, balance);
};

/**
 * Increase factory stock. Returns the updated product or null if the product
 * no longer exists.
 */
export const addFactoryStock = (productId, quantity, options = {}) => {
  return Product.findByIdAndUpdate(
    productId,
    { $inc: { factoryStock: quantity } },
    { new: true, session: options.session || null, runValidators: true }
  );
};

/**
 * Decrease factory stock ONLY if enough is available. Returns the updated
 * product document, or null when there is insufficient stock (or the product
 * is missing) — the caller should abort without writing any ledger movement.
 */
export const deductFactoryStock = (productId, quantity, options = {}) => {
  return Product.findOneAndUpdate(
    { _id: productId, factoryStock: { $gte: quantity } },
    { $inc: { factoryStock: -quantity } },
    { new: true, session: options.session || null, runValidators: true }
  );
};

/**
 * Set the balance to an absolute value (operator-driven manual correction).
 */
export const setFactoryStock = (productId, quantity, options = {}) => {
  return Product.findByIdAndUpdate(
    productId,
    { $set: { factoryStock: Math.max(0, quantity) } },
    { new: true, session: options.session || null, runValidators: true }
  );
};

/**
 * Backfill every product's balance from the movement ledger. Idempotent and
 * safe to run at startup.
 */
export const syncAllFactoryStocks = async () => {
  const rows = await FactoryInventory.aggregate([
    { $group: { _id: '$productId', total: { $sum: '$quantity' } } }
  ]);

  const bulk = Product.collection.initializeUnorderedBulkOp();
  for (const row of rows) {
    if (!row._id) {
      continue;
    }
    bulk.find({ _id: row._id }).updateOne({
      $set: { factoryStock: Math.max(0, row.total) }
    });
  }
  if (rows.length > 0) {
    await bulk.execute();
  }
  return rows.length;
};