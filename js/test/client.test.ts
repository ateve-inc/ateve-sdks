import { describe, expect, it } from "vitest";
import Ateve, {
  ApiConnectionError,
  ApiResponseError,
  ConcurrencyLimitError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  type Fetch,
} from "../src";

const goldenResponse = {
  id: "req_01J9ZK3V6XQ8",
  created: 1783776000,
  latency_ms: 412,
  query: {
    original: "climate policy analysis",
    effective: "climate policy analysis 2026",
    auto_tuned: { freshness_boost: true },
  },
  answer: {
    content: "Recent climate policy has focused on...",
    citations: [
      {
        url: "https://reuters.com/article/abc",
        title: "New climate framework announced",
        start_index: 0,
        end_index: 42,
        quote: "Recent climate policy has focused on",
      },
    ],
  },
  results: [
    {
      id: "results.#0",
      title: "New climate framework announced",
      url: "https://reuters.com/article/abc",
      display_url: "https://reuters.com/article/abc",
      site_name: "Reuters",
      language: "en",
      published_at: "2026-06-12T08:30:00.000Z",
      score: 0.94,
      snippet: "The framework introduces...",
      images: [],
      is_safe: true,
    },
  ],
  total_estimated_matches: 128000,
  usage: { credits: 3, breakdown: { search: 1, rerank: 1, answer: 1 } },
};

function jsonResponse(
  value: unknown = goldenResponse,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": "req_header",
      ...init.headers,
    },
  });
}

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
      limit: 20,
      dateRange: "2026-01-01..2026-06-30",
      locale: { mkt: "US", language: "en" },
      content: { summary: true, format: "markdown", maxCharacters: 5000 },
      safeSearch: false,
    });

    const wire = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(capturedUrl).toBe("https://api.test/v1/search");
    expect(wire.date_range).toBe("2026-01-01..2026-06-30");
    expect(wire.safe_search).toBe(false);
    expect(wire.content).toHaveProperty("max_characters", 5000);
    expect(wire.content).not.toHaveProperty("images");
    expect(wire).not.toHaveProperty("topic");
    expect(wire).not.toHaveProperty("dateRange");
    expect(new Headers(capturedInit?.headers).get("Authorization")).toBe(
      "Bearer sk_test",
    );
    expect(new Headers(capturedInit?.headers).get("User-Agent")).toBe(
      "ateve-js/0.1.0",
    );
    expect(capturedInit?.redirect).toBe("manual");
    expect(response.latencyMs).toBe(412);
    expect(response.results[0]?.displayUrl).toBe(
      "https://reuters.com/article/abc",
    );
    expect(response.usage?.credits).toBe(3);
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

    await expect(client.search({ query: "q" })).rejects.toBeInstanceOf(
      PaymentRequiredError,
    );
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
    const fetch: Fetch = async () =>
      jsonResponse({ id: "req_incomplete" }, { status: 200 });
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
    await expect(client.search({ query: "second" })).rejects.toBeInstanceOf(
      ConcurrencyLimitError,
    );
    release();
    await first;
    await client.search({ query: "third" });
    expect(hits).toBe(2);
  });

  it("validates the published request and endpoint contract locally", async () => {
    const fetch: Fetch = async () => jsonResponse();
    const client = new Ateve({ apiKey: "sk_test", fetch });

    expect(() => new Ateve({ apiKey: "key\r\nX-Evil: injected", fetch })).toThrow(
      "CR, LF",
    );
    expect(
      () =>
        new Ateve({
          apiKey: "key",
          baseUrl: "https://user:password@api.ateve.ai",
          fetch,
        }),
    ).toThrow("user-info");
    await expect(client.search({ query: "q", offset: 100 })).rejects.toThrow("offset");
    await expect(client.search({ query: "q", content: { maxCharacters: 0 } })).rejects.toThrow("maxCharacters");
    await expect(client.search({ query: "q", offset: 99, content: { maxCharacters: 8000 } })).resolves.toBeDefined();
    await expect(client.search({ query: " ", limit: 0 })).rejects.toThrow("query");
    await expect(
      client.search({ query: "q", dateRange: "2026-02-31" }),
    ).rejects.toThrow("calendar date");
    await expect(
      client.search({
        query: "q",
        locale: { userLocation: { timezone: "PST" } },
      }),
    ).rejects.toThrow("region-based");
  });
});
