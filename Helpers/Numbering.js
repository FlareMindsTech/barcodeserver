/**
 * @file Numbering.js
 * @description Shared retry helper for sequential number generation.
 *
 * Bill/invoice numbers are derived by "read the latest matching number, then
 * insert +1". Two concurrent requests can compute the same next number; one
 * insert wins and the other hits a unique-index E11000. Because numbers are
 * emitted by the timestamped sequence, the losing request simply regenerates a
 * fresh number and saves again — an atomic counter is therefore unnecessary.
 *
 * `retryOnDuplicate(fn)` reruns `fn` (which must generate a brand-new number
 * and attempt an insert) whenever it fails with duplicate-key 11000.
 */

export const isDuplicateKeyError = (error) => {
  if (!error) return false;
  if (error.code === 11000) return true;
  if (error.name === 'MongoServerError' && (error.code === 11000 || error.code === 11001)) return true;
  if (error.cause) return isDuplicateKeyError(error.cause);
  return false;
};

export const retryOnDuplicate = async (fn, { attempts = 5 } = {}) => {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
};