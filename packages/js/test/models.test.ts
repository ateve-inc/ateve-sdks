import { expect, it } from "vitest";
import Ateve from "../src";
import { goldenResponse as fixture } from "./helpers";

it("preserves response nulls, defaults and unknown-field handling", async () => {
  const body = {
    ...fixture,
    unknown_top_level: "ignored",
    results: [
      { published_at: null, summary: null, is_safe: null, unknown_result_field: "ignored" },
    ],
  };
  const client = new Ateve({
    apiKey: "sk_test",
    fetch: async () => new Response(JSON.stringify(body)),
  });
  const response = await client.search({ query: "query" });
  expect(response.results[0]).toEqual({
    publishedAt: null,
    summary: null,
    isSafe: null,
    images: [],
  });
  expect(response).not.toHaveProperty("unknownTopLevel");
});

it("preserves nullable image defaults and date strings", async () => {
  const body = {
    ...fixture,
    results: [
      {
        published_at: "2026-06-12T08:30:00.000Z",
        images: [{ url: "https://example.com/image.png" }],
      },
    ],
  };
  const client = new Ateve({
    apiKey: "sk_test",
    fetch: async () => new Response(JSON.stringify(body)),
  });
  const response = await client.search({ query: "query" });
  expect(response.results[0]?.publishedAt).toBe("2026-06-12T08:30:00.000Z");
  expect(response.results[0]?.images[0]).toEqual({
    url: "https://example.com/image.png",
    width: null,
    height: null,
    alt: null,
  });
});

it("preserves falsy values and normalizes nested optional response sections", async () => {
  const body = {
    ...fixture,
    created: 0,
    latency_ms: 0,
    query: { original: "query", effective: "", auto_tuned: { enabled: false } },
    answer: { content: "", citations: [{ start_index: 0, end_index: 0, quote: "" }] },
    results: [
      {
        score: 0,
        snippet: "",
        raw_content: "",
        is_safe: false,
        highlights: ["", null, 7],
        images: [{ url: "", width: 0, height: null, alt: "" }],
      },
    ],
    news: [{ title: "" }],
    images: [{ url: "https://example.com/image.png" }],
    videos: [{ title: "", duration_seconds: 0 }],
    total_estimated_matches: null,
    usage: { credits: 0, breakdown: { search: 0, rerank: 0, answer: 0 } },
  };
  const client = new Ateve({
    apiKey: "key",
    fetch: async () => new Response(JSON.stringify(body)),
  });
  const response = await client.search({ query: "query" });
  expect(response).toEqual({
    id: fixture.id,
    created: 0,
    latencyMs: 0,
    query: { original: "query", effective: "", autoTuned: { enabled: false } },
    answer: { content: "", citations: [{ startIndex: 0, endIndex: 0, quote: "" }] },
    results: [
      {
        score: 0,
        snippet: "",
        rawContent: "",
        isSafe: false,
        highlights: [""],
        images: [{ url: "", width: 0, height: null, alt: "" }],
      },
    ],
    news: [{ title: "", images: [] }],
    images: [{ url: "https://example.com/image.png", width: null, height: null, alt: null }],
    videos: [{ title: "", durationSeconds: 0 }],
    totalEstimatedMatches: null,
    usage: { credits: 0, breakdown: { search: 0, rerank: 0, answer: 0 } },
  });
});
