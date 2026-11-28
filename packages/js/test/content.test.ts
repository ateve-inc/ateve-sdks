import { expect, it } from "vitest";
import Ateve, {
  ApiResponseError,
  ConcurrencyLimitError,
  InvalidRequestError,
  ServerError,
} from "../src";
import type { DecisionRequest } from "../src";
import decisionInput from "../../contract/fixtures/decision-request.json";
import decisionOutput from "../../contract/fixtures/decision-response.json";
import fetchResponse from "../../contract/fixtures/fetch-response.json";
import models from "../../contract/fixtures/models-response.json";
import { deferred, jsonResponse } from "./helpers";

const decisionRequest: DecisionRequest = {
  ...decisionInput,
  questions: {
    category: { ...decisionInput.questions.category, type: "choice" },
    quality: { ...decisionInput.questions.quality, type: "score" },
    approved: { ...decisionInput.questions.approved, type: "noul" },
  },
};

it("sends one authenticated request to each new route and decodes typed responses", async () => {
  const calls: [string, string | undefined, unknown][] = [];
  const client = new Ateve({
    apiKey: "test",
    baseUrl: "https://example.org/prefix",
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test");
      expect(headers.get("Content-Type")).toBe(init?.method === "GET" ? null : "application/json");
      calls.push([path, init?.method, init?.body ? JSON.parse(String(init.body)) : undefined]);
      if (path.endsWith("/fetch")) return jsonResponse({ ...fetchResponse, extra: true });
      return jsonResponse(path.endsWith("/models") ? models : decisionOutput);
    },
  });

  const url = "https://example.org/page?lang=中文";
  expect(await client.fetch(url)).toEqual(fetchResponse);
  const response = await client.decisions.decide(decisionRequest);
  expect(response.answers.category).toMatchObject({ type: "choice", choice: "below" });
  const score = response.answers.quality;
  if (score?.type !== "score") throw new Error("Expected a Score answer");
  expect(score.legend["2"]).toEqual(["High", true]);
  expect(score.score).toBe(1.85);
  expect(response.answers.approved).toEqual({ type: "noul", noul: 0.98 });
  expect(response.usage).toEqual({ inputTokens: 1077, outputTokens: 0 });
  expect((await client.decisions.listModels()).models[1]).toEqual({
    name: "jev-latest",
    description: "Alias for ateve-jev-v1",
    releaseDate: "2026-10-02",
  });
  expect(calls).toEqual([
    ["/prefix/v1/fetch", "POST", { url }],
    ["/prefix/v1/systemone", "POST", decisionRequest],
    ["/prefix/v1/models", "GET", undefined],
  ]);
});

it("reuses API error and response parsing without retries", async () => {
  const responses = [
    jsonResponse({ error: { code: "fetch_forbidden", message: "Rejected" } }, { status: 403 }),
    jsonResponse(
      {
        id: "req_budget",
        error: { code: "token_budget_exceeded", details: { limit_tokens: 100 } },
      },
      { status: 400 },
    ),
    jsonResponse(
      { error: { code: "service_unavailable" } },
      { status: 502, headers: { "Retry-After": "4" } },
    ),
    jsonResponse({ model: "ateve-jev-v1", answers: { q: { type: "noul" } }, usage: {} }),
  ];
  const client = new Ateve({
    apiKey: "test",
    fetch: async () => {
      const response = responses.shift();
      if (!response) throw new Error("Unexpected additional request");
      return response;
    },
  });
  const url = "https://example.org";
  await expect(client.fetch(url)).rejects.toMatchObject({
    name: InvalidRequestError.name,
    statusCode: 403,
    requestId: "req_header",
    code: "fetch_forbidden",
    message: "Rejected",
  });
  await expect(client.decisions.decide(decisionRequest)).rejects.toMatchObject({
    code: "token_budget_exceeded",
    requestId: "req_budget",
    details: { limit_tokens: 100 },
  });
  await expect(client.decisions.listModels()).rejects.toMatchObject({
    name: ServerError.name,
    statusCode: 502,
    retryAfterSeconds: 4,
  });
  await expect(client.decisions.decide(decisionRequest)).rejects.toBeInstanceOf(ApiResponseError);
  expect(responses).toHaveLength(0);
});

it("shares the parent client's concurrency limit with decisions", async () => {
  const hold = deferred();
  const client = new Ateve({
    apiKey: "test",
    maxConcurrentRequests: 1,
    fetch: async (url) => {
      if (String(url).endsWith("/models")) return jsonResponse(models);
      await hold.promise;
      return jsonResponse(fetchResponse);
    },
  });
  const pending = client.fetch("https://example.org");
  try {
    await expect(client.decisions.listModels()).rejects.toBeInstanceOf(ConcurrencyLimitError);
  } finally {
    hold.resolve();
    await pending;
  }
  expect((await client.decisions.listModels()).models[0]?.name).toBe("ateve-jev-v1");
});
