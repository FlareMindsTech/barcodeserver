/**
 * @file AppEnv.js
 * @description Centralized environment access with fail-fast validation.
 *
 * Security rule: never fall back to a hardcoded default for secrets. If a
 * required value is missing or still set to the insecure placeholder, throw
 * so the process refuses to boot instead of silently signing tokens with a
 * known secret.
 */

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '' || secret === 'your-secret-key-here') {
    throw new Error(
      'JWT_SECRET environment variable is not set (or still uses the insecure placeholder). ' +
      'Set a strong secret in the .env file before starting the server.'
    );
  }
  return secret;
};

export const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} is required but not set.`);
  }
  return value;
};