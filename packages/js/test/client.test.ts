import { describe, expect, it } from "vitest";
import Ateve, {
  ApiConnectionError,
  ApiResponseError,
  ConcurrencyLimitError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  VERSION,
  type Fetch,
} from "../src";

import { jsonResponse } from "./helpers";

describe("Ateve JavaScript SDK", () => {
  it("maps camelCase to snake_case and returns typed camelCase data", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetch: Fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse();
    };
    const client = new Ateve({
      apiKey: "sk_test",
      baseUrl: "https://api.test/",
      fetch,
    });

    const response = await client.search({
      query: "climate policy analysis",
      maxResults: 20,
      dateRange: "2026-01-01..2026-06-30",
      locale: { mkt: "US", language: "en" },
      content: { snippet: false, text: { format: "markdown", maxCharacters: 5000 } },
      safeSearch: false,
    });

    const wire = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(capturedUrl).toBe("https://api.test/v1/search");
    expect(wire.date_range).toBe("2026-01-01..2026-06-30");
    expect(wire.safe_search).toBe(false);
    expect(wire.max_results).toBe(20);
    expect(wire.content).toEqual({
      snippet: false,
      text: { format: "markdown", max_characters: 5000 },
    });
    for (const name of ["limit", "offset", "contents"]) expect(wire).not.toHaveProperty(name);
    expect(wire.content).not.toHaveProperty("images");
    expect(wire).not.toHaveProperty("topic");
    expect(wire).not.toHaveProperty("dateRange");
    expect(new Headers(capturedInit?.headers).get("Authorization")).toBe("Bearer sk_test");
    expect(new Headers(capturedInit?.headers).get("User-Agent")).toBe(`ateve-js/${VERSION}`);
    expect(capturedInit?.redirect).toBe("manual");
    expect(response.latencyMs).toBe(412);
    expect(response.results[0]?.displayUrl).toBe("https://reuters.com/article/abc");
    expect(response.query.original).toBe("climate policy analysis");
    expect(response.totalEstimatedMatches).toBe(128000);
  });

  it("does not retry and preserves rate-limit hints", async () => {
    let hits = 0;
    const fetch: Fetch = async () => {
      hits += 1;
      return jsonResponse(
        {
          id: "req_rate",
          error: {
            code: "rate_limit_exceeded",
            message: "Slow down.",
            type: "rate_limit_error",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": "7",
            "X-Ateve-Limit-Scope": "qpm",
          },
        },
      );
    };
    const client = new Ateve({ apiKey: "sk_test", fetch });

    const error = await client.search({ query: "q" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.requestId).toBe("req_rate");
    expect(error.retryAfterSeconds).toBe(7);
    expect(error.limitScope).toBe("qpm");
    expect(error.isRetryable).toBe(true);
    expect(hits).toBe(1);
  });

  it("applies request defaults and enables text only when its object is supplied", async () => {
    const bodies: unknown[] = [];
    const client = new Ateve({
      apiKey: "sk_test",
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse();
      },
    });
    await client.search({ query: "q" });
    await client.search({ query: "q", content: {} });
    await client.search({ query: "q", maxResults: 1, content: { snippet: false, text: {} } });
    expect(bodies).toEqual([
      { query: "q", max_results: 10 },
      { query: "q", max_results: 10, content: { snippet: true } },
      { query: "q", max_results: 1, content: { snippet: false, text: { format: "text" } } },
    ]);
  });

  it("rejects invalid result counts and text options before sending a request", async () => {
    let hits = 0;
    const client = new Ateve({
      apiKey: "sk_test",
      fetch: async () => {
        hits++;
        return jsonResponse();
      },
    });
    for (const maxResults of [0, -1, 101, 1.5, NaN, Infinity]) {
      await expect(client.search({ query: "q", maxResults })).rejects.toThrow("maxResults");
    }
    for (const maxCharacters of [0, -1, 2_147_483_648, 1.5]) {
      await expect(
        client.search({ query: "q", content: { text: { maxCharacters } } }),
      ).rejects.toThrow("maxCharacters");
    }
    // JavaScript callers are not protected by the TypeScript enum or object types.
    await expect(
      // @ts-expect-error Invalid wire format must also fail at runtime.
      client.search({ query: "q", content: { text: { format: "html" } } }),
    ).rejects.toThrow("format");
    // @ts-expect-error The former boolean raw_content option no longer applies.
    await expect(client.search({ query: "q", content: { text: true } })).rejects.toThrow(
      "must be an object",
    );
    expect(hits).toBe(0);
  });

  it("does not turn an empty Retry-After header into a zero-second hint", async () => {
    const fetch: Fetch = async () =>
      jsonResponse(
        { error: { code: "rate_limit_exceeded", message: "Slow down." } },
        { status: 429, headers: { "Retry-After": "" } },
      );
    const client = new Ateve({ apiKey: "sk_test", fetch });

    const error = await client.search({ query: "q" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it("keeps billing 403 separate", async () => {
    const fetch: Fetch = async () =>
      jsonResponse(
        {
          id: "req_billing",
          error: {
            code: "insufficient_credit",
            message: "Low credit.",
            type: "invalid_request_error",
          },
        },
        { status: 403 },
      );
    const client = new Ateve({ apiKey: "sk_test", fetch });

    await expect(client.search({ query: "q" })).rejects.toBeInstanceOf(PaymentRequiredError);
  });

  it("uses the response request ID for non-JSON errors without leaking body", async () => {
    const fetch: Fetch = async () =>
      new Response("<html>internal gateway detail</html>", {
        status: 502,
        headers: { "X-Request-Id": "req_gateway" },
      });
    const client = new Ateve({ apiKey: "sk_test", fetch });

    const error = await client.search({ query: "q" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ServerError);
    expect(error.requestId).toBe("req_gateway");
    expect(error.message).toBe("HTTP 502");
    expect(error.message).not.toContain("gateway detail");
  });

  it("types malformed 2xx responses as possibly billed", async () => {
    const fetch: Fetch = async () =>
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "X-Request-Id": "req_bad" },
      });
    const client = new Ateve({
      apiKey: "sk_test",
      baseUrl: "https://api.test",
      fetch,
    });

    const error = await client.search({ query: "q" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error.statusCode).toBe(200);
    expect(error.requestId).toBe("req_bad");
    expect(error.requestMayHaveBeenSent).toBe(true);
    expect(error.message).not.toContain("<html>");
  });

  it("types structurally incomplete 2xx responses as possibly billed", async () => {
    const fetch: Fetch = async () => jsonResponse({ id: "req_incomplete" }, { status: 200 });
    const client = new Ateve({
      apiKey: "sk_test",
      baseUrl: "https://api.test",
      fetch,
    });

    const error = await client.search({ query: "q" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error.statusCode).toBe(200);
    expect(error.requestId).toBe("req_header");
    expect(error.requestMayHaveBeenSent).toBe(true);
  });

  it("enforces the response body limit", async () => {
    const fetch: Fetch = async () => new Response("x".repeat(65));
    const client = new Ateve({
      apiKey: "sk_test",
      maxResponseBytes: 64,
      fetch,
    });

    const error = await client.search({ query: "q" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiConnectionError);
    expect(error.requestMayHaveBeenSent).toBe(true);
    expect(error.message).toContain("maxResponseBytes=64");
  });

  it("classifies known DNS/connect failures as not sent", async () => {
    const cause = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    const fetch: Fetch = async () => {
      throw new TypeError("fetch failed", { cause });
    };
    const client = new Ateve({ apiKey: "sk_test", fetch });

    const error = await client.search({ query: "q" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiConnectionError);
    expect(error.requestMayHaveBeenSent).toBe(false);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("marks a pre-aborted caller signal as not sent", async () => {
    let hits = 0;
    const fetch: Fetch = async () => {
      hits += 1;
      return jsonResponse();
    };
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const client = new Ateve({ apiKey: "sk_test", fetch });

    const error = await client
      .search({ query: "q" }, { signal: controller.signal })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiConnectionError);
    expect(error.requestMayHaveBeenSent).toBe(false);
    expect(hits).toBe(0);
  });

  it("rejects excess work with a fail-fast bulkhead and recovers", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hits = 0;
    const fetch: Fetch = async () => {
      hits += 1;
      await gate;
      return jsonResponse();
    };
    const client = new Ateve({
      apiKey: "sk_test",
      fetch,
      maxConcurrentRequests: 1,
    });

    const first = client.search({ query: "first" });
    await Promise.resolve();
    await expect(client.search({ query: "second" })).rejects.toBeInstanceOf(ConcurrencyLimitError);
    release();
    await first;
    await client.search({ query: "third" });
    expect(hits).toBe(2);
  });

  it("validates the published request and endpoint contract locally", async () => {
    const fetch: Fetch = async () => jsonResponse();
    const client = new Ateve({ apiKey: "sk_test", fetch });

    expect(() => new Ateve({ apiKey: "key\r\nX-Evil: injected", fetch })).toThrow("CR, LF");
    expect(
      () =>
        new Ateve({
          apiKey: "key",
          baseUrl: "https://user:password@api.ateve.ai",
          fetch,
        }),
    ).toThrow("user-info");
    await expect(client.search({ query: "q", maxResults: 101 })).rejects.toThrow("maxResults");
    await expect(
      client.search({ query: "q", content: { text: { maxCharacters: 0 } } }),
    ).rejects.toThrow("maxCharacters");
    await expect(
      client.search({ query: "q", maxResults: 100, content: { text: { maxCharacters: 8000 } } }),
    ).resolves.toBeDefined();
    await expect(client.search({ query: " ", maxResults: 0 })).rejects.toThrow("query");
    await expect(client.search({ query: "q", dateRange: "2026-02-31" })).rejects.toThrow(
      "calendar date",
    );
    await expect(
      client.search({
        query: "q",
        locale: { userLocation: { timezone: "PST" } },
      }),
    ).rejects.toThrow("region-based");
  });
});
