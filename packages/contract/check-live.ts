import assert from "node:assert/strict";
import { validateAgainstContract } from "./validation.ts";

const scenarios: { name: string; content?: Record<string, unknown> }[] = [
  { name: "default" },
  { name: "content-defaults", content: {} },
  { name: "highlights-disabled", content: { highlights: false } },
  { name: "highlights-enabled", content: { highlights: true } },
  { name: "highlights-no-snippet", content: { highlights: true, snippet: false } },
  {
    name: "highlights-text",
    content: { highlights: true, text: { format: "text", max_characters: 300 } },
  },
  {
    name: "highlights-markdown",
    content: { highlights: true, text: { format: "markdown", max_characters: 300 } },
  },
];

function record(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Expected object",
  );
  return value as Record<string, unknown>;
}

export async function checkLiveApi(
  apiKey: string | undefined,
  send: typeof fetch = fetch,
  log: (message: string) => void = console.log,
): Promise<void> {
  if (!apiKey?.trim()) throw new Error("ATEVE_API_KEY is required for live API validation");
  for (const scenario of scenarios) {
    const request = {
      query: "Python programming language",
      max_results: 2,
      ...(scenario.content && { content: scenario.content }),
    };
    validateAgainstContract("SearchRequest", request);
    let response: Response;
    let body: unknown;
    try {
      response = await send("https://api.ateve.ai/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(request),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      // Do not log response bodies, credentials, or transport exception details.
      const status =
        error instanceof Error && /^HTTP \d{3}$/.test(error.message)
          ? error.message
          : "transport or JSON decoding failed";
      throw new Error(`${scenario.name}: ${status}`);
    }
    validateAgainstContract("SearchResponse", body);
    const results = record(body).results;
    assert.ok(
      Array.isArray(results) && results.length > 0,
      `${scenario.name}: no results to validate`,
    );
    assert.ok(results.length <= request.max_results, `${scenario.name}: too many results`);
    for (const raw of results) {
      const result = record(raw);
      if (scenario.content?.highlights === true)
        assert.ok(Array.isArray(result.highlights), `${scenario.name}: missing highlights`);
      else assert.ok(!("highlights" in result), `${scenario.name}: unexpected highlights`);
      if (scenario.content?.snippet === false)
        assert.ok(!("snippet" in result), `${scenario.name}: unexpected snippet`);
      else assert.equal(typeof result.snippet, "string", `${scenario.name}: missing snippet`);
      if (scenario.content?.text) {
        assert.ok("text" in result, `${scenario.name}: missing text`);
        if (typeof result.text === "string")
          assert.ok(Array.from(result.text).length <= 300, `${scenario.name}: text exceeds limit`);
      } else assert.ok(!("text" in result), `${scenario.name}: unexpected text`);
    }
    log(
      `${scenario.name}: HTTP 200; request and response match the contract; ${results.length} results`,
    );
  }
}

if (import.meta.main) {
  const key = process.env.ATEVE_API_KEY;
  try {
    await checkLiveApi(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live API validation failed";
    console.error(key ? message.replaceAll(key, "[redacted]") : message);
    process.exitCode = 1;
  }
}
