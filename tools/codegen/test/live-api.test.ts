import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkLiveApi } from "../../../packages/contract/check-live.ts";
import { validateAgainstContract } from "../../../packages/contract/validation.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/contract/fixtures/live-highlights-response.json", import.meta.url),
    "utf8",
  ),
);

function responseFor(init?: RequestInit): Record<string, unknown> {
  const request = JSON.parse(String(init?.body));
  const response = structuredClone(fixture);
  for (const result of response.results) {
    if (request.content?.highlights !== true) delete result.highlights;
    if (request.content?.snippet === false) delete result.snippet;
    if (request.content?.text) result.text = "Extracted text";
  }
  return response;
}

test("live probes validate every request and raw response without credentials or network in unit tests", async () => {
  const requests: unknown[] = [];
  const messages: string[] = [];
  await checkLiveApi(
    "test-secret",
    async (input, init) => {
      assert.equal(input, "https://api.ateve.ai/v1/search");
      assert.equal(init?.redirect, "manual");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-secret");
      const body = JSON.parse(String(init?.body));
      validateAgainstContract("SearchRequest", body);
      requests.push(body);
      return Response.json(responseFor(init));
    },
    (message) => messages.push(message),
  );
  assert.equal(requests.length, 7);
  assert.equal(messages.length, 7);
  assert.ok(messages.every((message) => message.includes("match the contract")));
  assert.ok(!messages.join("\n").includes("test-secret"));
});

test("live checks require a key and never retry HTTP or transport failures", async () => {
  let hits = 0;
  const fail: typeof fetch = async () => {
    hits++;
    return new Response("untrusted response body", { status: 429 });
  };
  await assert.rejects(checkLiveApi(undefined, fail), /ATEVE_API_KEY is required/);
  assert.equal(hits, 0);
  await assert.rejects(checkLiveApi("test-secret", fail), /^Error: default: HTTP 429$/);
  assert.equal(hits, 1);
  await assert.rejects(
    checkLiveApi("test-secret", async () => {
      throw new Error("transport details including test-secret");
    }),
    /^Error: default: transport or JSON decoding failed$/,
  );
});

test("shared contract validation rejects invalid raw responses before normalization", async () => {
  for (const malformed of [
    { ...fixture, id: undefined },
    { ...fixture, results: [{ images: [], highlights: "wrong wire type" }] },
    { ...fixture, results: [{ images: [], highlights: [42] }] },
  ]) {
    await assert.rejects(
      checkLiveApi("test-secret", async () => Response.json(malformed)),
      /SearchResponse:/,
    );
  }
  assert.throws(
    () =>
      validateAgainstContract("SearchRequest", {
        query: "q",
        content: { highlights: "true" },
      }),
    /SearchRequest:/,
  );
});

test("live checks reject vacuous successes and missing enabled highlights", async () => {
  await assert.rejects(
    checkLiveApi("test-secret", async () => Response.json({ ...fixture, results: [] })),
    /no results/,
  );
  await assert.rejects(
    checkLiveApi(
      "test-secret",
      async (_input, init) => {
        const response = responseFor(init);
        for (const result of response.results as Record<string, unknown>[])
          delete result.highlights;
        return Response.json(response);
      },
      () => {},
    ),
    /highlights-enabled: missing highlights/,
  );
  await assert.rejects(
    checkLiveApi("test-secret", async () => Response.json(fixture)),
    /default: unexpected highlights/,
  );
});
