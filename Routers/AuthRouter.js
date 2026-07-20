/**
 * @file AuthRouter.js
 * @description Router for authentication endpoints (login, logout, refresh-token).
 */

import express from 'express';
import { login, logout, refreshToken } from '../Controllers/AuthController.js';
import { authenticate } from '../Middlewares/auth.middleware.js';

const router = express.Router();

// Public Routes
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/refresh-token', refreshToken);

export default router;
