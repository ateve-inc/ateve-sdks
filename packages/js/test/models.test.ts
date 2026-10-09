import { expect, it } from "vitest";
import Ateve from "../src";
import { goldenResponse as fixture } from "./helpers";
import defaults from "../../contract/fixtures/live-default-response.json";
import text from "../../contract/fixtures/live-text-response.json";
import markdown from "../../contract/fixtures/live-markdown-response.json";
import noSnippet from "../../contract/fixtures/live-no-snippet-response.json";

it("preserves response nulls, defaults and unknown-field handling", async () => {
  const body = {
    ...fixture,
    unknown_top_level: "ignored",
    results: [{ published_at: null, text: null, is_safe: null, unknown_result_field: "ignored" }],
  };
  const client = new Ateve({
    apiKey: "sk_test",
    fetch: async () => new Response(JSON.stringify(body)),
  });
  const response = await client.search({ query: "query" });
  expect(response.results[0]).toEqual({ publishedAt: null, text: null, isSafe: null, images: [] });
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

it("preserves falsy values while omitting obsolete response fields", async () => {
  const body = {
    ...fixture,
    created: 0,
    latency_ms: 0,
    query: { original: "query", effective: "obsolete", auto_tuned: {} },
    results: [
      {
        score: 0,
        snippet: "",
        text: "",
        is_safe: false,
        raw_content: "obsolete",
        summary: null,
        highlights: [],
        site_name: "obsolete",
        language: "en",
        images: [{ url: "", width: 0, height: null, alt: "" }],
      },
    ],
    answer: {},
    news: [],
    images: [],
    videos: [],
    usage: {},
    total_estimated_matches: null,
  };
  const client = new Ateve({
    apiKey: "key",
    fetch: async () => new Response(JSON.stringify(body)),
  });
  expect(await client.search({ query: "query" })).toEqual({
    id: fixture.id,
    created: 0,
    latencyMs: 0,
    query: { original: "query" },
    results: [
      {
        score: 0,
        snippet: "",
        text: "",
        isSafe: false,
        images: [{ url: "", width: 0, height: null, alt: "" }],
      },
    ],
    totalEstimatedMatches: null,
  });
});

it.each([
  ["defaults", defaults],
  ["text", text],
  ["markdown", markdown],
  ["no snippet", noSnippet],
])("decodes the captured %s response including omitted and null text", async (_name, body) => {
  const client = new Ateve({
    apiKey: "sk_test",
    fetch: async () => new Response(JSON.stringify(body)),
  });
  const response = await client.search({ query: "Python programming language" });
  expect(response.query).toEqual({ original: "Python programming language" });
  expect(response.results).toHaveLength(body.results.length);
  for (const [index, result] of body.results.entries()) {
    const parsed = response.results[index]!;
    expect(parsed.id).toBe(result.id);
    expect(parsed.images).toEqual(result.images);
    for (const field of ["text", "snippet"] as const) {
      if (field in result)
        expect(parsed).toHaveProperty(field, result[field as keyof typeof result]);
      else expect(parsed).not.toHaveProperty(field);
    }
  }
});
