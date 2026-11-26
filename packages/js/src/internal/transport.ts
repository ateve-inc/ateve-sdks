import { ofetch } from "ofetch";
import { ApiConnectionError, ApiResponseError } from "../errors";
import type { RequestOptions } from "../options";
import type { ClientConfig } from "./config";
import { connectionError, mapApiError } from "./http-errors";
import { BodyLimitExceededError, decodeJson, readLimited } from "./response-body";

function responseError(
  baseUrl: string,
  response: Response,
  model: string,
  cause: unknown,
): ApiResponseError {
  const requestId = response.headers.get("X-Request-Id");
  return new ApiResponseError(`Response from ${baseUrl} could not be decoded as ${model}`, {
    statusCode: response.status,
    ...(requestId !== null && { requestId }),
    baseUrl,
    cause,
  });
}

export function createTransport(config: ClientConfig, userAgent: string) {
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
        if (response.ok) {
          response._data = body;
        } else {
          try {
            response._data = decodeJson(body);
          } catch {
            response._data = undefined;
          }
          // ofetch's onResponseError handles 4xx/5xx; manual redirects also fail.
          if (response.status < 400 || response.status >= 600) {
            throw mapApiError(response, response._data);
          }
        }
      },
      onResponseError({ response }) {
        throw mapApiError(response, response._data);
      },
    },
    { fetch: config.fetch },
  );

  return async function send<T>(
    path: string,
    body: Record<string, unknown>,
    options: RequestOptions & { timeoutMs: number },
    model: string,
    parse: (value: unknown) => T,
  ): Promise<T> {
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
      const response = await fetch.raw<Uint8Array>(path, { method: "POST", body, signal });
      try {
        return parse(decodeJson(response._data!));
      } catch (cause) {
        throw responseError(baseUrl, response, model, cause);
      }
    } finally {
      clearTimeout(timer);
    }
  };
}
