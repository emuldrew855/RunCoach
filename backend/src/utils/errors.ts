/**
 * Typed Error Classes
 *
 * Custom error hierarchy for better error handling and user-friendly messages.
 * All operational errors extend AppError for consistent handling.
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any[]) {
    super(400, message, true, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 401 Unauthorized - Authentication errors
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, true);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * 403 Forbidden - Authorization errors
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, true);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * 404 Not Found - Resource not found errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, true);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 409 Conflict - Resource conflict errors
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, true);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * 429 Too Many Requests - Rate limit errors
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter?: string) {
    super(429, message, true, retryAfter ? { retryAfter } : undefined);
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * 500 Internal Server Error - Database errors
 */
export class DatabaseError extends AppError {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(500, `Database error: ${message}`, false);
    this.originalError = originalError;
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * 500 Internal Server Error - Agent/AI errors
 */
export class AgentError extends AppError {
  public readonly toolName?: string;

  constructor(message: string, toolName?: string) {
    super(500, `Agent error: ${message}`, true);
    this.toolName = toolName;
    Object.setPrototypeOf(this, AgentError.prototype);
  }
}

/**
 * 502 Bad Gateway - External API errors (Strava, OpenAI)
 */
export class ExternalAPIError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(service: string, message: string, originalError?: Error) {
    super(502, `${service} API error: ${message}`, true);
    this.service = service;
    this.originalError = originalError;
    Object.setPrototypeOf(this, ExternalAPIError.prototype);
  }
}

/**
 * Check if error is an operational error (safe to expose to user)
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
