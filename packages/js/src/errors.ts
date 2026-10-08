export class AteveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ApiErrorOptions {
  statusCode: number;
  requestId?: string;
  code?: string;
  param?: string;
  type?: string;
  docUrl?: string;
}

export class ApiError extends AteveError {
  readonly statusCode: number;
  readonly requestId: string | undefined;
  readonly code: string | undefined;
  readonly param: string | undefined;
  readonly type: string | undefined;
  readonly docUrl: string | undefined;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.code = options.code;
    this.param = options.param;
    this.type = options.type;
    this.docUrl = options.docUrl;
  }

  get isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

export class InvalidRequestError extends ApiError {}
export class AuthenticationError extends ApiError {}
export class PaymentRequiredError extends ApiError {}
export class ServerError extends ApiError {}

export interface RateLimitErrorOptions extends ApiErrorOptions {
  retryAfterSeconds?: number;
  limitScope?: string;
}

export class RateLimitError extends ApiError {
  readonly retryAfterSeconds: number | undefined;
  readonly limitScope: string | undefined;

  constructor(message: string, options: RateLimitErrorOptions) {
    super(message, options);
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.limitScope = options.limitScope;
  }
}

export class ApiConnectionError extends AteveError {
  readonly baseUrl: string;
  readonly requestMayHaveBeenSent: boolean;

  constructor(
    message: string,
    options: {
      baseUrl: string;
      requestMayHaveBeenSent: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.baseUrl = options.baseUrl;
    this.requestMayHaveBeenSent = options.requestMayHaveBeenSent;
  }
}

export class ApiResponseError extends AteveError {
  readonly statusCode: number;
  readonly requestId: string | undefined;
  readonly baseUrl: string;
  readonly requestMayHaveBeenSent = true;

  constructor(
    message: string,
    options: {
      statusCode: number;
      requestId?: string;
      baseUrl: string;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.baseUrl = options.baseUrl;
  }
}

export class ConcurrencyLimitError extends AteveError {
  readonly maxConcurrentRequests: number;

  constructor(maxConcurrentRequests: number) {
    super(
      `Concurrency limit reached (maxConcurrentRequests=${maxConcurrentRequests}); ` +
        "request rejected",
    );
    this.maxConcurrentRequests = maxConcurrentRequests;
  }
}
