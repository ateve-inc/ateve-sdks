import { ApiConnectionError, ConcurrencyLimitError } from "./errors";
import type { AteveOptions, RequestOptions } from "./options";
import type { SearchRequest, SearchResponse } from "./types";
import { resolveConfig, validateTimeout } from "./internal/config";
import { createTransport } from "./internal/transport";
import { toWire } from "./internal/serialization";
import { validateRequest } from "./internal/validation";

export const VERSION = "0.2.1";
export const DEFAULT_BASE_URL = "https://api.ateve.ai";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RESPONSE_BYTES: number = 32 * 1024 * 1024;

export default class Ateve {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxConcurrentRequests: number;

  readonly #transport: ReturnType<typeof createTransport>;
  #inFlight = 0;

  constructor(options: AteveOptions = {}) {
    const config = resolveConfig(options, {
      baseUrl: DEFAULT_BASE_URL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    });
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
    this.maxResponseBytes = config.maxResponseBytes;
    this.maxConcurrentRequests = config.maxConcurrentRequests;
    this.#transport = createTransport(config, `ateve-js/${VERSION}`);
  }

  async search(request: SearchRequest, options: RequestOptions = {}): Promise<SearchResponse> {
    validateRequest(request);
    if (this.maxConcurrentRequests > 0 && this.#inFlight >= this.maxConcurrentRequests) {
      throw new ConcurrencyLimitError(this.maxConcurrentRequests);
    }
    if (options.signal?.aborted) {
      throw new ApiConnectionError("Request was cancelled before dispatch", {
        baseUrl: this.baseUrl,
        requestMayHaveBeenSent: false,
        cause: options.signal.reason,
      });
    }
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    validateTimeout(timeoutMs, "request timeoutMs");

    this.#inFlight += 1;
    try {
      return await this.#transport(toWire(request), { ...options, timeoutMs });
    } finally {
      this.#inFlight -= 1;
    }
  }
}
