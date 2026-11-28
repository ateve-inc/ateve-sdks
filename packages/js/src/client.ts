import { ApiConnectionError, ConcurrencyLimitError } from "./errors";
import type { AteveOptions, RequestOptions } from "./options";
import type {
  DecisionRequest,
  DecisionResponse,
  FetchRequest,
  FetchResponse,
  ImageSearchRequest,
  ImageSearchResponse,
  ListModelsResponse,
  VideoSearchRequest,
  VideoSearchResponse,
  SearchRequest,
  SearchResponse,
} from "./types";
import { resolveConfig, validateTimeout } from "./internal/config";
import { createTransport } from "./internal/transport";
import { toWire } from "./internal/serialization";
import { imageSearchResponse, searchResponse, videoSearchResponse } from "./internal/response";
import { decisionResponse, fetchResponse, listModelsResponse } from "./internal/content-response";
import { mediaBody, validateRequest } from "./internal/validation";

export const VERSION = "0.4.3";
export const DEFAULT_BASE_URL = "https://api.ateve.ai";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RESPONSE_BYTES: number = 32 * 1024 * 1024;

/** Structured decisions and model discovery for the Decisions API. */
export interface DecisionClient {
  decide(request: DecisionRequest, options?: RequestOptions): Promise<DecisionResponse>;
  listModels(options?: RequestOptions): Promise<ListModelsResponse>;
}

export default class Ateve {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxConcurrentRequests: number;
  readonly decisions: DecisionClient;

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
    this.decisions = {
      decide: (request, options = {}) =>
        this.#send("/v1/systemone", request, options, "DecisionResponse", decisionResponse),
      listModels: (options = {}) =>
        this.#send("/v1/models", undefined, options, "ListModelsResponse", listModelsResponse),
    };
  }

  async search(request: SearchRequest, options: RequestOptions = {}): Promise<SearchResponse> {
    validateRequest(request);
    return this.#send("/v1/search", toWire(request), options, "SearchResponse", searchResponse);
  }

  async searchImages(
    request: ImageSearchRequest,
    options: RequestOptions = {},
  ): Promise<ImageSearchResponse> {
    return this.#send(
      "/v1/images",
      mediaBody(request),
      options,
      "ImageSearchResponse",
      imageSearchResponse,
    );
  }

  async searchVideos(
    request: VideoSearchRequest,
    options: RequestOptions = {},
  ): Promise<VideoSearchResponse> {
    return this.#send(
      "/v1/videos",
      mediaBody(request),
      options,
      "VideoSearchResponse",
      videoSearchResponse,
    );
  }

  async fetch(url: string, options: RequestOptions = {}): Promise<FetchResponse> {
    const request: FetchRequest = { url };
    return this.#send("/v1/fetch", request, options, "FetchResponse", fetchResponse);
  }

  async #send<T>(
    path: string,
    body: object | undefined,
    options: RequestOptions,
    model: string,
    parse: (value: unknown) => T,
  ): Promise<T> {
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
      return await this.#transport(path, body, { ...options, timeoutMs }, model, parse);
    } finally {
      this.#inFlight -= 1;
    }
  }
}
