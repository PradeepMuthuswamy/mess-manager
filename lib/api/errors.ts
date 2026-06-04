export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  unauthenticated: (msg = 'Missing or invalid bearer token') => new ApiError(401, 'unauthenticated', msg),
  forbidden:      (msg = 'Forbidden')                       => new ApiError(403, 'forbidden', msg),
  notFound:       (msg = 'Not found')                       => new ApiError(404, 'not_found', msg),
  conflict:       (msg = 'Conflict', details?: unknown)     => new ApiError(409, 'conflict', msg, details),
  validation:     (details: unknown, msg = 'Invalid input') => new ApiError(422, 'validation_failed', msg, details),
  rateLimited:    (msg = 'Rate limit exceeded')             => new ApiError(429, 'rate_limited', msg),
  badRequest:     (msg = 'Bad request')                     => new ApiError(400, 'bad_request', msg),
  internal:       (msg = 'Internal server error')           => new ApiError(500, 'internal', msg),
};
