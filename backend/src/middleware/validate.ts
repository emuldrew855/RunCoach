/**
 * Request Validation Middleware
 *
 * Generic middleware for validating request body, params, and query
 * using Zod schemas.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validate request against Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.post('/actions/:actionId/approve',
 *   validate(approveActionSchema),
 *   approveAction
 * );
 * ```
 */
export function validate(schema: z.ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate the entire request object (params, body, query)
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Validation passed, proceed to next middleware
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format validation errors for user-friendly response
        const zodError = error as ZodError;
        const formattedErrors = zodError.issues.map((err: z.ZodIssue) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }

      // Unexpected error during validation
      console.error('Validation middleware error:', error);
      res.status(500).json({ error: 'Validation error occurred' });
    }
  };
}
