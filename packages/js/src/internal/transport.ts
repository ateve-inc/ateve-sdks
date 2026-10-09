import { ofetch } from "ofetch";
import { ApiConnectionError, ApiResponseError } from "../errors";
import type { RequestOptions } from "../options";
import type { SearchResponse } from "../types";
import type { ClientConfig } from "./config";
import { connectionError, mapApiError } from "./http-errors";
import { BodyLimitExceededError, decodeJson, readLimited } from "./response-body";
import { searchResponse } from "./response";

function responseError(baseUrl: string, response: Response, cause: unknown): ApiResponseError {
  const requestId = response.headers.get("X-Request-Id");
  return new ApiResponseError(`Response from ${baseUrl} could not be decoded as SearchResponse`, {
    statusCode: response.status,
    ...(requestId !== null && { requestId }),
    baseUrl,
    cause,
  });
}

export function createTransport(
  config: ClientConfig,
  userAgent: string,
): (
  body: Record<string, unknown>,
  options: RequestOptions & { timeoutMs: number },
) => Promise<SearchResponse> {
  const { baseUrl, maxResponseBytes } = config;
  const fetch = ofetch.create(
    {
      baseURL: baseUrl,
      retry: false,
      redirect: "manual",
      // Consume the stream ourselves before JSON parsing to enforce the byte cap.
      responseType: "stream",
      onRequest({ options }) {
        options.headers.set("Authorization", `Bearer ${config.apiKey}`);
        options.headers.set("User-Agent", userAgent);
        options.headers.set("Accept", "application/json");
        options.headers.set("Content-Type", "application/json");
      },
      onRequestError({ error }) {
        throw connectionError(baseUrl, error);
      },
      async onResponse({ response, options }) {
        let body: Uint8Array;
        try {
          body = await readLimited(response, maxResponseBytes, options.signal ?? undefined);
        } catch (cause) {
          throw new ApiConnectionError(
            cause instanceof BodyLimitExceededError
              ? `Response from ${baseUrl} exceeded maxResponseBytes=${maxResponseBytes}`
              : `Response from ${baseUrl} could not be read`,
            { baseUrl, requestMayHaveBeenSent: true, cause },
          );
        }
        let decoded: unknown;
        try {
          decoded = decodeJson(body);
        } catch (cause) {
          if (response.ok) {
            throw responseError(baseUrl, response, cause);
          }
        }
        if (response.ok) {
          try {
            response._data = searchResponse(decoded);
          } catch (cause) {
            throw responseError(baseUrl, response, cause);
          }
        } else {
          response._data = decoded;
          // ofetch's onResponseError handles 4xx/5xx; manual redirects also fail.
          if (response.status < 400 || response.status >= 600) {
            throw mapApiError(response, decoded);
          }
        }
      },
      onResponseError({ response }) {
        throw mapApiError(response, response._data);
      },
    },
    { fetch: config.fetch },
  );

  return async (body, options) => {
    // Keep the deadline active through streamed reading and response decoding.
    const controller = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const timer = setTimeout(
      () => controller.abort(new Error("request timeout")),
      options.timeoutMs,
    );
    try {
      return await fetch<SearchResponse>("/v1/search", { method: "POST", body, signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
