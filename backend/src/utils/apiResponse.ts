/**
 * Standardized API Response Helpers
 *
 * Provides consistent response format across all endpoints.
 */

/**
 * Standard success response format
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: string;
  details?: any;
}

/**
 * Create a success response
 *
 * @param data - Response data
 * @param message - Optional success message
 * @returns Standardized success response
 *
 * @example
 * ```typescript
 * res.json(successResponse({ action: approvedAction }, 'Action approved successfully'));
 * ```
 */
export function successResponse<T>(data: T, message?: string): SuccessResponse<T> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  return response;
}

/**
 * Create an error response
 *
 * @param message - Error message
 * @param details - Optional error details (validation errors, etc.)
 * @returns Standardized error response
 *
 * @example
 * ```typescript
 * res.status(400).json(errorResponse('Validation failed', validationErrors));
 * ```
 */
export function errorResponse(message: string, details?: any): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: message,
  };

  if (details) {
    response.details = details;
  }

  return response;
}
