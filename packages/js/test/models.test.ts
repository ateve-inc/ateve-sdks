import { expect, it } from "vitest";
import Ateve from "../src";
import fixture from "../../contract/fixtures/golden-response.json";

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
