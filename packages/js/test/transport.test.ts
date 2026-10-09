import { afterEach, describe, expect, it, vi } from "vitest";
import Ateve, {
  ApiConnectionError,
  ApiResponseError,
  AuthenticationError,
  InvalidRequestError,
  PaymentRequiredError,
  ServerError,
  type Fetch,
} from "../src";
import { deferred, goldenResponse, jsonResponse } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("ofetch transport policy", () => {
  it.each([
    [400, InvalidRequestError],
    [401, AuthenticationError],
    [402, PaymentRequiredError],
    [403, InvalidRequestError],
    [500, ServerError],
    [503, ServerError],
  ])("maps HTTP %i and preserves metadata without retrying", async (status, ErrorClass) => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse(
        {
          id: "req_payload",
          error: {
            message: "Rejected",
            code: "bad_input",
            param: "query",
            type: "request_error",
            doc_url: "https://ateve.ai/docs/errors",
          },
        },
        { status },
      ),
    );
    const client = new Ateve({ apiKey: "key", fetch });
    const error: unknown = await client
      .search({ query: "query" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toMatchObject({
      message: "Rejected",
      statusCode: status,
      requestId: "req_payload",
      code: "bad_input",
      param: "query",
      type: "request_error",
      docUrl: "https://ateve.ai/docs/errors",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps credentials, base paths and bodies isolated across concurrent clients", async () => {
    const fetch = vi.fn<Fetch>(async () => jsonResponse());
    const first = new Ateve({ apiKey: "first", baseUrl: "https://api.test/proxy/", fetch });
    const second = new Ateve({ apiKey: "second", baseUrl: "https://other.test", fetch });
    await Promise.all([
      first.search({ query: "one" }),
      second.search({ query: "two" }),
      first.search({ query: "three" }),
    ]);
    expect(
      fetch.mock.calls.map(([url, init]) => [
        String(url),
        new Headers(init?.headers).get("Authorization"),
        JSON.parse(String(init?.body)),
      ]),
    ).toEqual([
      ["https://api.test/proxy/v1/search", "Bearer first", { query: "one" }],
      ["https://other.test/v1/search", "Bearer second", { query: "two" }],
      ["https://api.test/proxy/v1/search", "Bearer first", { query: "three" }],
    ]);
  });

  it("rejects manual redirects without following the Location header", async () => {
    const fetch = vi.fn<Fetch>(
      async () =>
        new Response(null, {
          status: 307,
          headers: { Location: "https://other.test", "X-Request-Id": "req_redirect" },
        }),
    );
    const client = new Ateve({ apiKey: "key", fetch });
    await expect(client.search({ query: "query" })).rejects.toMatchObject({
      statusCode: 307,
      requestId: "req_redirect",
      message: "HTTP 307",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("aborts a pending fetch at the request deadline and releases concurrency capacity", async () => {
    vi.useFakeTimers();
    const started = deferred();
    const fetch = vi.fn<Fetch>(async (_url, init) => {
      started.resolve();
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });
    const client = new Ateve({ apiKey: "key", fetch, timeoutMs: 60_000, maxConcurrentRequests: 1 });
    const pending = client
      .search({ query: "query" }, { timeoutMs: 25 })
      .catch((caught: unknown) => caught);
    await started.promise;
    await vi.advanceTimersByTimeAsync(25);
    expect(await pending).toMatchObject({ requestMayHaveBeenSent: true });
    expect(await pending).toBeInstanceOf(ApiConnectionError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    fetch.mockImplementation(async () => jsonResponse());
    await expect(client.search({ query: "next" })).resolves.toHaveProperty("id", goldenResponse.id);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["timeout", "cancellation"] as const)(
    "enforces %s while reading a stalled response body",
    async (kind) => {
      vi.useFakeTimers();
      const reading = deferred();
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>(
        {
          pull() {
            reading.resolve();
          },
          cancel,
        },
        { highWaterMark: 0 },
      );
      const fetch = vi.fn<Fetch>(async () => new Response(stream));
      const controller = new AbortController();
      const client = new Ateve({ apiKey: "key", fetch, timeoutMs: 25, maxConcurrentRequests: 1 });
      const pending = client
        .search({ query: "query" }, { signal: controller.signal })
        .catch((caught: unknown) => caught);
      await reading.promise;
      if (kind === "timeout") await vi.advanceTimersByTimeAsync(25);
      else controller.abort(new Error("caller cancelled"));
      const error = await pending;
      expect(error).toBeInstanceOf(ApiConnectionError);
      expect(error).toMatchObject({ requestMayHaveBeenSent: true });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      fetch.mockImplementation(async () => jsonResponse());
      await expect(client.search({ query: "next" })).resolves.toBeDefined();
    },
  );

  it.each(["declared", "streamed"] as const)(
    "cancels a %s oversized body before decoding",
    async (kind) => {
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(33));
        },
        cancel,
      });
      const fetch = vi.fn<Fetch>(
        async () =>
          new Response(stream, {
            headers: kind === "declared" ? { "Content-Length": "33" } : {},
          }),
      );
      const client = new Ateve({ apiKey: "key", fetch, maxResponseBytes: 32 });
      await expect(client.search({ query: "query" })).rejects.toMatchObject({
        requestMayHaveBeenSent: true,
        message: expect.stringContaining("maxResponseBytes=32"),
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("supports an unlimited body and rejects an empty successful response", async () => {
    const fetch = vi.fn<Fetch>(async () => jsonResponse());
    const client = new Ateve({ apiKey: "key", fetch, maxResponseBytes: 0 });
    await expect(client.search({ query: "query" })).resolves.toHaveProperty(
      "id",
      goldenResponse.id,
    );
    fetch.mockImplementation(async () => new Response(null, { status: 204 }));
    await expect(client.search({ query: "query" })).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("types a stream read failure as possibly sent and recovers capacity", async () => {
    const cause = new Error("socket reset");
    const fetch = vi.fn<Fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(cause);
            },
          }),
        ),
    );
    const client = new Ateve({ apiKey: "key", fetch, maxConcurrentRequests: 1 });
    await expect(client.search({ query: "query" })).rejects.toMatchObject({
      name: "ApiConnectionError",
      cause,
      requestMayHaveBeenSent: true,
    });
    fetch.mockImplementation(async () => jsonResponse());
    await expect(client.search({ query: "next" })).resolves.toBeDefined();
  });

  it("handles unknown transport failures with cyclic causes without retrying", async () => {
    const cause = new Error("socket reset");
    cause.cause = cause;
    const fetch = vi.fn<Fetch>(async () => {
      throw cause;
    });
    const client = new Ateve({ apiKey: "key", fetch });
    await expect(client.search({ query: "query" })).rejects.toMatchObject({
      name: "ApiConnectionError",
      cause,
      requestMayHaveBeenSent: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
