/**
 * Zod Validation Schemas for Agent Action Endpoints
 *
 * Validates request parameters and bodies for action approval/rejection.
 */

import { z } from 'zod';

/**
 * UUID validation for action IDs
 */
const uuidSchema = z.string().uuid('Invalid action ID format');

/**
 * POST /api/agent/actions/:actionId/approve
 */
export const approveActionSchema = z.object({
  params: z.object({
    actionId: uuidSchema,
  }),
  body: z.object({}).optional(), // No body needed for approval
});

/**
 * POST /api/agent/actions/:actionId/reject
 */
export const rejectActionSchema = z.object({
  params: z.object({
    actionId: uuidSchema,
  }),
  body: z.object({
    reason: z.string().min(1).max(500).optional(),
  }).optional(),
});

/**
 * GET /api/agent/actions/:actionId
 */
export const getActionSchema = z.object({
  params: z.object({
    actionId: uuidSchema,
  }),
});

/**
 * GET /api/agent/actions/pending
 */
export const getPendingActionsSchema = z.object({
  query: z.object({
    limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
    offset: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 0)),
  }).optional(),
});
