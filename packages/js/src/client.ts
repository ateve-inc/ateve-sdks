import {
  ApiConnectionError,
  ApiError,
  ApiErrorOptions,
  ApiResponseError,
  AuthenticationError,
  ConcurrencyLimitError,
  InvalidRequestError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
} from "./errors";
import {
  AnswerBlock,
  AteveOptions,
  Citation,
  Fetch,
  ImageItem,
  QueryInfo,
  RequestOptions,
  SearchRequest,
  SearchResponse,
  SearchResult,
  Usage,
  VideoItem,
} from "./types";

export const VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://api.ateve.ai";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

const USER_AGENT = `ateve-js/${VERSION}`;
const BILLING_CODES = new Set([
  "insufficient_credit",
  "credit_limit_exceeded",
  "payment_required",
]);

class BodyLimitExceededError extends Error {}

function environment(name: string): string | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeGlobal.process?.env?.[name];
}

function requireHeaderValue(value: string, name: string): string {
  const checked = value.trim();
  if (!checked) {
    throw new Error(`${name} must not be blank`);
  }
  if (/[\r\n\u0000]/.test(checked)) {
    throw new Error(`${name} must not contain CR, LF, or NUL characters`);
  }
  return checked;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new Error(`baseUrl is not a valid URL: ${value}`, { cause: error });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "baseUrl must be an absolute http(s) URL without user-info, query, or fragment",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

function requireIntegerRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
  name: string,
): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value < minimum || value > maximum)
  ) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function parseCalendarDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`dateRange contains an invalid date shape: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`dateRange contains an invalid calendar date: ${value}`);
  }
  return timestamp;
}

function validateDateRange(value: string | undefined): void {
  if (
    value === undefined ||
    value === "" ||
    ["day", "week", "month", "year"].includes(value)
  ) {
    return;
  }
  if (!value.includes("..")) {
    parseCalendarDate(value);
    return;
  }
  const parts = value.split("..");
  if (parts.length !== 2 || (!parts[0] && !parts[1])) {
    throw new Error("dateRange must contain exactly one non-empty '..' range");
  }
  const start = parts[0] ? parseCalendarDate(parts[0]) : undefined;
  const end = parts[1] ? parseCalendarDate(parts[1]) : undefined;
  if (start !== undefined && end !== undefined && end < start) {
    throw new Error("dateRange end date must be on or after the start date");
  }
}

function validateTimeZone(value: string): void {
  if (/^(PST|EST|CST|MST)$/.test(value) || /^UTC[+-]/.test(value)) {
    throw new Error("timezone must be a region-based IANA Time Zone identifier");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch (error) {
    throw new Error("timezone must be a valid IANA Time Zone identifier", {
      cause: error,
    });
  }
}

function validateRequest(request: SearchRequest): void {
  if (typeof request.query !== "string" || !request.query.trim()) {
    throw new Error("query is required");
  }
  if (request.query.length > 2_000) {
    throw new Error("query must not exceed 2000 characters");
  }
  requireIntegerRange(request.limit, 1, 50, "limit");
  requireIntegerRange(request.offset, 0, 99, "offset");
  requireIntegerRange(request.content?.maxCharacters, 1, 2_147_483_647, "content.maxCharacters");
  if ((request.includeDomains?.length ?? 0) > 300) {
    throw new Error("includeDomains must not exceed 300 entries");
  }
  if ((request.excludeDomains?.length ?? 0) > 300) {
    throw new Error("excludeDomains must not exceed 300 entries");
  }
  validateDateRange(request.dateRange);
  if (request.locale?.mkt !== undefined && !/^[A-Z]{2}$/.test(request.locale.mkt)) {
    throw new Error("locale.mkt must be an uppercase ISO 3166-1 alpha-2 code");
  }
  if (
    request.locale?.language !== undefined &&
    !/^[a-z]{2}$/.test(request.locale.language)
  ) {
    throw new Error("locale.language must be a lowercase ISO 639-1 code");
  }
  if (
    request.locale?.userLocation?.country !== undefined &&
    !/^[A-Z]{2}$/.test(request.locale.userLocation.country)
  ) {
    throw new Error(
      "locale.userLocation.country must be an uppercase ISO 3166-1 alpha-2 code",
    );
  }
  if (request.locale?.userLocation?.timezone !== undefined) {
    validateTimeZone(request.locale.userLocation.timezone);
  }
}

function assign<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function toWire(request: SearchRequest): Record<string, unknown> {
  const wire: Record<string, unknown> = { query: request.query };
  assign(wire, "limit", request.limit);
  assign(wire, "offset", request.offset);
  assign(wire, "date_range", request.dateRange);
  assign(wire, "include_domains", request.includeDomains);
  assign(wire, "exclude_domains", request.excludeDomains);
  assign(wire, "safe_search", request.safeSearch);
  if (request.locale !== undefined) {
    const locale: Record<string, unknown> = {};
    assign(locale, "mkt", request.locale.mkt);
    assign(locale, "language", request.locale.language);
    if (request.locale.userLocation !== undefined) {
      const location: Record<string, unknown> = {};
      assign(location, "country", request.locale.userLocation.country);
      assign(location, "region", request.locale.userLocation.region);
      assign(location, "city", request.locale.userLocation.city);
      assign(location, "timezone", request.locale.userLocation.timezone);
      locale.user_location = location;
    }
    wire.locale = locale;
  }
  if (request.content !== undefined) {
    const content: Record<string, unknown> = {};
    assign(content, "snippet", request.content.snippet);
    assign(content, "raw_content", request.content.rawContent);
    assign(content, "format", request.content.format);
    assign(content, "summary", request.content.summary);
    assign(content, "highlights", request.content.highlights);
    assign(content, "max_characters", request.content.maxCharacters);
    assign(content, "favicon", request.content.favicon);
    wire.content = content;
  }
  return wire;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : string(value);
}

function nullableNumber(value: unknown): number | null | undefined {
  return value === null ? null : number(value);
}

function nullableBoolean(value: unknown): boolean | null | undefined {
  return value === null ? null : boolean(value);
}

function image(value: unknown): ImageItem {
  const item = record(value);
  return {
    url: string(item.url) ?? "",
    width: nullableNumber(item.width) ?? null,
    height: nullableNumber(item.height) ?? null,
    alt: nullableString(item.alt) ?? null,
  };
}

function citation(value: unknown): Citation {
  const item = record(value);
  return {
    ...(string(item.url) !== undefined && { url: string(item.url)! }),
    ...(string(item.title) !== undefined && { title: string(item.title)! }),
    ...(number(item.start_index) !== undefined && {
      startIndex: number(item.start_index)!,
    }),
    ...(number(item.end_index) !== undefined && {
      endIndex: number(item.end_index)!,
    }),
    ...(string(item.quote) !== undefined && { quote: string(item.quote)! }),
  };
}

function answer(value: unknown): AnswerBlock {
  const item = record(value);
  return {
    ...(string(item.content) !== undefined && { content: string(item.content)! }),
    ...(Array.isArray(item.citations) && {
      citations: item.citations.map(citation),
    }),
  };
}

function queryInfo(value: unknown): QueryInfo {
  const item = record(value);
  const original = string(item.original);
  if (original === undefined) {
    throw new TypeError("QueryInfo.original is required");
  }
  return {
    original,
    ...(string(item.effective) !== undefined && {
      effective: string(item.effective)!,
    }),
    ...(item.auto_tuned !== undefined && { autoTuned: record(item.auto_tuned) }),
  };
}

function result(value: unknown): SearchResult {
  const item = record(value);
  return {
    ...(string(item.id) !== undefined && { id: string(item.id)! }),
    ...(string(item.title) !== undefined && { title: string(item.title)! }),
    ...(string(item.url) !== undefined && { url: string(item.url)! }),
    ...(string(item.display_url) !== undefined && {
      displayUrl: string(item.display_url)!,
    }),
    ...(string(item.site_name) !== undefined && {
      siteName: string(item.site_name)!,
    }),
    ...(string(item.language) !== undefined && {
      language: string(item.language)!,
    }),
    ...(nullableString(item.published_at) !== undefined && {
      publishedAt: nullableString(item.published_at)!,
    }),
    ...(number(item.score) !== undefined && { score: number(item.score)! }),
    ...(string(item.snippet) !== undefined && { snippet: string(item.snippet)! }),
    ...(string(item.raw_content) !== undefined && {
      rawContent: string(item.raw_content)!,
    }),
    ...(nullableString(item.summary) !== undefined && {
      summary: nullableString(item.summary)!,
    }),
    ...(item.highlights === null && { highlights: null }),
    ...(Array.isArray(item.highlights) && {
      highlights: item.highlights.filter(
        (entry): entry is string => typeof entry === "string",
      ),
    }),
    ...(string(item.favicon) !== undefined && { favicon: string(item.favicon)! }),
    images: Array.isArray(item.images) ? item.images.map(image) : [],
    ...(nullableBoolean(item.is_safe) !== undefined && {
      isSafe: nullableBoolean(item.is_safe)!,
    }),
  };
}

function usage(value: unknown): Usage {
  const item = record(value);
  const breakdown = record(item.breakdown);
  return {
    ...(number(item.credits) !== undefined && { credits: number(item.credits)! }),
    ...(item.breakdown !== undefined && {
      breakdown: {
        ...(number(breakdown.search) !== undefined && {
          search: number(breakdown.search)!,
        }),
        ...(number(breakdown.rerank) !== undefined && {
          rerank: number(breakdown.rerank)!,
        }),
        ...(number(breakdown.answer) !== undefined && {
          answer: number(breakdown.answer)!,
        }),
      },
    }),
  };
}

function video(value: unknown): VideoItem {
  const item = record(value);
  return {
    ...(string(item.url) !== undefined && { url: string(item.url)! }),
    ...(string(item.thumbnail) !== undefined && {
      thumbnail: string(item.thumbnail)!,
    }),
    ...(string(item.title) !== undefined && { title: string(item.title)! }),
    ...(number(item.duration_seconds) !== undefined && {
      durationSeconds: number(item.duration_seconds)!,
    }),
  };
}

function searchResponse(value: unknown): SearchResponse {
  const item = record(value);
  if (
    string(item.id) === undefined ||
    number(item.created) === undefined ||
    number(item.latency_ms) === undefined ||
    string(record(item.query).original) === undefined ||
    !Array.isArray(item.results)
  ) {
    throw new TypeError("SearchResponse is missing one or more required fields");
  }
  return {
    id: string(item.id)!,
    created: number(item.created)!,
    latencyMs: number(item.latency_ms)!,
    query: queryInfo(item.query),
    ...(item.answer !== undefined && { answer: answer(item.answer) }),
    results: Array.isArray(item.results) ? item.results.map(result) : [],
    ...(Array.isArray(item.news) && { news: item.news.map(result) }),
    ...(Array.isArray(item.images) && { images: item.images.map(image) }),
    ...(Array.isArray(item.videos) && { videos: item.videos.map(video) }),
    ...(nullableNumber(item.total_estimated_matches) !== undefined && {
      totalEstimatedMatches: nullableNumber(item.total_estimated_matches)!,
    }),
    ...(item.usage !== undefined && { usage: usage(item.usage) }),
  };
}

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
  assign(options, "requestId", string(payload.id) ?? response.headers.get("X-Request-Id") ?? undefined);
  assign(options, "code", string(details.code));
  assign(options, "param", string(details.param));
  assign(options, "type", string(details.type));
  assign(options, "docUrl", string(details.doc_url));
  return options;
}

function mapApiError(response: Response, value: unknown): ApiError {
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

function knownPreSendFetchFailure(error: unknown): boolean {
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
  let current: unknown = error;
  while (current !== null && typeof current === "object") {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && preSendCodes.has(candidate.code)) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

async function readLimited(response: Response, maximum: number): Promise<Uint8Array> {
  const declared = response.headers.get("Content-Length");
  if (
    maximum > 0 &&
    declared !== null &&
    /^\d+$/.test(declared) &&
    Number(declared) > maximum
  ) {
    await response.body?.cancel();
    throw new BodyLimitExceededError();
  }
  if (response.body === null) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (maximum > 0 && value.byteLength > maximum - received) {
        await reader.cancel();
        throw new BodyLimitExceededError();
      }
      received += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function decodeJson(body: Uint8Array): unknown {
  const text = new TextDecoder().decode(body);
  if (!text) {
    return undefined;
  }
  return JSON.parse(text) as unknown;
}

export default class Ateve {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxConcurrentRequests: number;

  readonly #authorization: string;
  readonly #fetch: Fetch;
  #inFlight = 0;

  constructor(options: AteveOptions = {}) {
    const apiKey = requireHeaderValue(
      options.apiKey ?? environment("ATEVE_API_KEY") ?? "",
      "apiKey",
    );
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? environment("ATEVE_BASE_URL") ?? DEFAULT_BASE_URL,
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.maxConcurrentRequests = options.maxConcurrentRequests ?? 0;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("timeoutMs must be positive");
    }
    if (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 0) {
      throw new Error("maxResponseBytes must be a non-negative integer");
    }
    if (
      !Number.isInteger(this.maxConcurrentRequests) ||
      this.maxConcurrentRequests < 0
    ) {
      throw new Error("maxConcurrentRequests must be a non-negative integer");
    }
    const defaultFetch = globalThis.fetch?.bind(globalThis);
    if (options.fetch === undefined && defaultFetch === undefined) {
      throw new Error("A global fetch implementation is required (Node.js 22+)");
    }
    this.#fetch = options.fetch ?? (defaultFetch as Fetch);
    this.#authorization = `Bearer ${apiKey}`;
  }

  async search(
    request: SearchRequest,
    options: RequestOptions = {},
  ): Promise<SearchResponse> {
    validateRequest(request);
    if (
      this.maxConcurrentRequests > 0 &&
      this.#inFlight >= this.maxConcurrentRequests
    ) {
      throw new ConcurrencyLimitError(this.maxConcurrentRequests);
    }
    if (options.signal?.aborted) {
      throw new ApiConnectionError("Request was cancelled before dispatch", {
        baseUrl: this.baseUrl,
        requestMayHaveBeenSent: false,
        cause: options.signal.reason,
      });
    }

    this.#inFlight += 1;
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      this.#inFlight -= 1;
      throw new Error("request timeoutMs must be positive");
    }
    const onAbort = (): void => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("request timeout")), timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.#fetch(`${this.baseUrl}/v1/search`, {
          method: "POST",
          headers: {
            Authorization: this.#authorization,
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
          },
          body: JSON.stringify(toWire(request)),
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        throw new ApiConnectionError(
          `Request to ${this.baseUrl} failed: ${
            error instanceof Error ? error.name : "transport error"
          }`,
          {
            baseUrl: this.baseUrl,
            requestMayHaveBeenSent: !knownPreSendFetchFailure(error),
            cause: error,
          },
        );
      }

      let body: Uint8Array;
      try {
        body = await readLimited(response, this.maxResponseBytes);
      } catch (error) {
        if (error instanceof BodyLimitExceededError) {
          throw new ApiConnectionError(
            `Response from ${this.baseUrl} exceeded ` +
              `maxResponseBytes=${this.maxResponseBytes}`,
            {
              baseUrl: this.baseUrl,
              requestMayHaveBeenSent: true,
              cause: error,
            },
          );
        }
        throw error;
      }

      let decoded: unknown;
      try {
        decoded = decodeJson(body);
      } catch (error) {
        if (!response.ok) {
          throw mapApiError(response, undefined);
        }
        throw new ApiResponseError(
          `Response from ${this.baseUrl} could not be decoded as SearchResponse`,
          {
            statusCode: response.status,
            ...(response.headers.get("X-Request-Id") !== null && {
              requestId: response.headers.get("X-Request-Id")!,
            }),
            baseUrl: this.baseUrl,
            cause: error,
          },
        );
      }
      if (!response.ok) {
        throw mapApiError(response, decoded);
      }
      try {
        return searchResponse(decoded);
      } catch (error) {
        throw new ApiResponseError(
          `Response from ${this.baseUrl} could not be decoded as SearchResponse`,
          {
            statusCode: response.status,
            ...(response.headers.get("X-Request-Id") !== null && {
              requestId: response.headers.get("X-Request-Id")!,
            }),
            baseUrl: this.baseUrl,
            cause: error,
          },
        );
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      this.#inFlight -= 1;
    }
  }
}
