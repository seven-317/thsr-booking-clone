import {NextResponse} from 'next/server';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CAPTCHA_INVALID'
  | 'CAPTCHA_EXPIRED'
  | 'CAPTCHA_UNAVAILABLE'
  | 'INVENTORY_UNAVAILABLE'
  | 'PROFILE_REQUIRED'
  | 'BOOKING_CLOSED'
  | 'INVALID_BOOKING'
  | 'INVALID_DEMO_CARD'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: Record<string, string>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? {details: error.details} : {})
        }
      },
      {
        status: error.status,
        headers: {'Cache-Control': 'no-store'}
      }
    );
  }

  console.error('Unhandled API error', error);
  return NextResponse.json(
    {error: {code: 'INTERNAL_ERROR', message: 'The server could not complete the request.'}},
    {status: 500, headers: {'Cache-Control': 'no-store'}}
  );
}

export async function readJsonBody(request: Request, maxBytes = 32_768) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'BAD_REQUEST', 'Content-Type must be application/json.');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, 'BAD_REQUEST', 'The request body is too large.');
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, 'BAD_REQUEST', 'The request body is too large.');
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', 'The request body is not valid JSON.');
  }
}

export function assertObject(value: unknown, field = 'body'): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be an object.`);
  }
}

export function requireString(
  value: unknown,
  field: string,
  options: {min?: number; max?: number; pattern?: RegExp} = {}
) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be a string.`);
  }

  const normalized = value.trim();
  if (normalized.length < (options.min ?? 1) || normalized.length > (options.max ?? 500)) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} has an invalid length.`);
  }
  if (options.pattern && !options.pattern.test(normalized)) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} has an invalid format.`);
  }
  return normalized;
}

export function requireInteger(value: unknown, field: string, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be an integer between ${min} and ${max}.`);
  }
  return value as number;
}

export function requireEnum<T extends string>(value: unknown, field: string, values: readonly T[]) {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be one of: ${values.join(', ')}.`);
  }
  return value as T;
}

export function assertSameOriginMutation(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'FORBIDDEN', 'Cross-site mutations are not allowed.');
  }

  const origin = request.headers.get('origin');
  if (!origin) return;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(403, 'FORBIDDEN', 'The request origin is invalid.');
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get('host') || requestUrl.host;
  const expectedProtocol = `${forwardedProtocol || requestUrl.protocol.replace(':', '')}:`;

  if (originUrl.host !== expectedHost || originUrl.protocol !== expectedProtocol) {
    throw new ApiError(403, 'FORBIDDEN', 'Cross-origin mutations are not allowed.');
  }
}
