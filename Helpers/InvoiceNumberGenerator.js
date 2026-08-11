/**
 * @file InvoiceNumberGenerator.js
 * @description Shared, robust invoice number generator used by BOTH the billing
 * and invoice controllers. Previously each controller had its own copy with a
 * different sequence padding, unescaped regex prefixes, and lexicographic
 * string sorting — a collision and duplicate-key hazard once the invoice prefix
 * or date format changes (old vs. new invoice formats).
 */

import Invoice from '../Models/Invoice.js';
import Settings from '../Models/Settings.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Generate the next invoice number: [Prefix]-YYYYMMDD-SEQ (4-digit sequence).
 *
 * Behavior notes:
 * - Prefix comes from Settings (invoicePrefix). Trailing dashes are stripped so
 *   "INV-" and "INV" both produce "INV-20260807-0001".
 * - The date is part of the prefix, so each new day restarts the sequence at 1.
 * - Changing the prefix (e.g. from "INV" to "FM-INV") starts a fresh sequence
 *   for the new prefix; old invoices keep their own numbers untouched, so both
 *   invoice formats can coexist without colliding.
 * - The numeric suffix is parsed from every matching invoice (works for 1, 3,
 *   4, 5+ digit sequences) instead of relying on lexicographic string sort,
 *   which silently mis-orders once sequence lengths differ.
 * - Regex metacharacters in a user-configured prefix are escaped.
 */
export const generateInvoiceNumber = async () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  let invoicePrefix = 'INV';
  const settings = await Settings.findOne();
  if (settings && settings.invoicePrefix) {
    invoicePrefix = settings.invoicePrefix.trim().replace(/-+$/, '');
  }

  const prefix = `${invoicePrefix}-${dateStr}-`;
  const escapedPrefix = escapeRegex(prefix);

  const todayInvoices = await Invoice.find(
    { invoiceNumber: { $regex: `^${escapedPrefix}` } },
    { invoiceNumber: 1 }
  );

  let maxSeq = 0;
  for (const inv of todayInvoices) {
    const match = String(inv.invoiceNumber).slice(prefix.length).match(/^\d+/);
    if (match) {
      const n = parseInt(match[0], 10);
      if (n > maxSeq) {
        maxSeq = n;
      }
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
};
