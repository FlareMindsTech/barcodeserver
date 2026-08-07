/**
 * @file UserRouter.js
 * @description Router for user management endpoints. Secures paths with authentication and role-based permissions.
 */

import express from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  changePassword,
  getProfile
} from '../Controllers/UserController.js';
import { authenticate, authorize } from '../Middlewares/index.js';

const router = express.Router();

// All user management routes require valid authentication
router.use(authenticate);

// 1. Profile route (Any authenticated user can view their own profile)
router.get('/profile', getProfile);

// 2. Password change route (Admin only)
// Note: Placed before dynamic /:id to prevent routing clash
router.put('/change-password', authorize(['ADMIN']), changePassword);

// 3. User CRUD routes (Admin only)
router.post('/', createUser);
router.get('/', authorize(['ADMIN']), getAllUsers);
router.get('/:id', authorize(['ADMIN']), getUserById);
router.put('/:id', updateUser);
router.delete('/:id', authorize(['ADMIN']), deleteUser);

export default router;
