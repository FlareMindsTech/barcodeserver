/**
 * @file AuditLog.js
 * @description Mongoose model for system-wide auditing and action tracking.
 * 
 * @relationship
 * - AuditLog (Many) -> User (1) via `userId` (Optional/Nullable if system event)
 * 
 * @indexes
 * - Single-field index on `userId` to track actions by a specific user.
 * - Single-field index on `module` to filter changes by feature/module (e.g. Products, Sales).
 * - Single-field index on `createdAt` (Descending) for chronologically sorting log history.
 * - Compound index on `module` and `action` for filtering admin actions.
 * 
 * @validation
 * - userId: Optional, Schema.Types.ObjectId (can be null for automatic system tasks).
 * - action: Required, trimmed string.
 * - module: Required, trimmed string (e.g. 'Product', 'User', 'Settings').
 * - oldValue: Optional, Schema.Types.Mixed (captures pre-change state).
 * - newValue: Optional, Schema.Types.Mixed (captures post-change state).
 * - ipAddress: Optional, trimmed string.
 * 
 * @example
 * {
 *   "userId": "60d0fe4f5311236168a109c9",
 *   "action": "UPDATE_PRODUCT",
 *   "module": "Product",
 *   "oldValue": { "sellingPrice": 800 },
 *   "newValue": { "sellingPrice": 850 },
 *   "ipAddress": "192.168.1.10",
 *   "createdAt": "2026-07-16T12:00:00.000Z"
 * }
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null // Null indicates automated system logs or unauthenticated actions
    },
    action: {
      type: String,
      required: [true, 'Audited action is required'],
      trim: true
    },
    module: {
      type: String,
      required: [true, 'Audited module name is required'],
      trim: true
    },
    oldValue: {
      type: Schema.Types.Mixed,
      default: null
    },
    newValue: {
      type: Schema.Types.Mixed,
      default: null
    },
    ipAddress: {
      type: String,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    collection: 'audit_logs'
  }
);

// Indexes
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ module: 1 });
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ module: 1, action: 1 });

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

export default AuditLog;
