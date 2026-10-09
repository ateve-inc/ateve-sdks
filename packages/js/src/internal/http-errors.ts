import {
  ApiConnectionError,
  ApiError,
  AuthenticationError,
  InvalidRequestError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
} from "../errors";
import type { ApiErrorOptions } from "../errors";
import { assign, record, string } from "./values";

const BILLING_CODES = new Set(["insufficient_credit", "credit_limit_exceeded", "payment_required"]);

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  const when = Date.parse(trimmed);
  return Number.isNaN(when) ? undefined : Math.max(0, Math.floor((when - Date.now()) / 1000));
}

function errorOptions(response: Response, payload: Record<string, unknown>): ApiErrorOptions {
  const details = record(payload.error);
  const options: ApiErrorOptions = { statusCode: response.status };
  assign(
    options,
    "requestId",
    string(payload.id) ?? response.headers.get("X-Request-Id") ?? undefined,
  );
  assign(options, "code", string(details.code));
  assign(options, "param", string(details.param));
  assign(options, "type", string(details.type));
  assign(options, "docUrl", string(details.doc_url));
  return options;
}

export function mapApiError(response: Response, value: unknown): ApiError {
  const payload = record(value);
  const details = record(payload.error);
  const message = string(details.message) ?? `HTTP ${response.status}`;
  const options = errorOptions(response, payload);
  if (response.status === 401) {
    return new AuthenticationError(message, options);
  }
  if (
    response.status === 402 ||
    (response.status === 403 && options.code !== undefined && BILLING_CODES.has(options.code))
  ) {
    return new PaymentRequiredError(message, options);
  }
  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
    const limitScope = response.headers.get("X-Ateve-Limit-Scope");
    return new RateLimitError(message, {
      ...options,
      ...(retryAfterSeconds !== undefined && {
        retryAfterSeconds,
      }),
      ...(limitScope !== null && {
        limitScope,
      }),
    });
  }
  if (response.status >= 500) {
    return new ServerError(message, options);
  }
  return new InvalidRequestError(message, options);
}

const preSendCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

function knownPreSendFetchFailure(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<object>();
  while (current !== null && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && preSendCodes.has(candidate.code)) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

export function connectionError(baseUrl: string, cause: unknown): ApiConnectionError {
  return new ApiConnectionError(
    `Request to ${baseUrl} failed: ${cause instanceof Error ? cause.name : "transport error"}`,
    { baseUrl, requestMayHaveBeenSent: !knownPreSendFetchFailure(cause), cause },
  );
}
