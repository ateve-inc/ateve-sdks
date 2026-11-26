import { describe, expect, it } from "vitest";
import Ateve, { ApiResponseError, ServerError } from "../src";
import images from "../../contract/fixtures/images-response.json";
import videos from "../../contract/fixtures/videos-response.json";
import { jsonResponse } from "./helpers";

describe("media search", () => {
  it("uses the media routes, omits an unspecified limit and decodes media fields", async () => {
    const calls: [string, unknown][] = [];
    const client = new Ateve({
      apiKey: "test",
      baseUrl: "https://example.org/prefix",
      fetch: async (url, init) => {
        calls.push([String(url), JSON.parse(String(init?.body))]);
        return jsonResponse(String(url).endsWith("/images") ? images : videos);
      },
    });
    const image = await client.searchImages({ query: "Webb" });
    const video = await client.searchVideos({ query: "Webb", maxResults: 2 });
    expect(calls).toEqual([
      ["https://example.org/prefix/v1/images", { query: "Webb" }],
      ["https://example.org/prefix/v1/videos", { query: "Webb", max_results: 2 }],
    ]);
    expect(image.results[0]?.hostPageUrl).toBe(images.results[0]?.host_page_url);
    expect(video.results[0]?.durationSeconds).toBe(180);
    expect(video.results[1]?.embeddingUrl).toBe(videos.results[1]?.embedding_url);
    expect(video.results[1]).not.toHaveProperty("url");
    expect(video.results[1]?.publishedAt).toBeNull();
  });
  it("validates media limits before dispatch and uses the shared error mapping", async () => {
    let calls = 0;
    const client = new Ateve({
      apiKey: "test",
      fetch: async () => {
        calls++;
        return calls === 1
          ? jsonResponse({ ...images, results: [{}] })
          : jsonResponse({ id: "test-id", error: { code: "timeout" } }, { status: 504 });
      },
    });
    await expect(client.searchImages({ query: "a".repeat(1001) })).rejects.toThrow("1000");
    await expect(client.searchVideos({ query: "x", maxResults: 11 })).rejects.toThrow("10");
    expect(calls).toBe(0);
    await expect(client.searchImages({ query: "🌍".repeat(1000) })).rejects.toBeInstanceOf(
      ApiResponseError,
    );
    await expect(client.searchVideos({ query: "x" })).rejects.toBeInstanceOf(ServerError);
    expect(calls).toBe(2);
  });
});
