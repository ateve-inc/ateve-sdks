import assert from "node:assert/strict";
import { validateAgainstContract } from "./validation.ts";

const environment = process.argv[2];
if (environment !== "test" && environment !== "production")
  throw new Error("Select the test or production environment");

const testKey = environment === "test" ? process.env.ATEVE_TEST_API_KEY?.trim() : undefined;
const key = testKey || process.env.ATEVE_API_KEY?.trim();
if (!key) {
  const variable = environment === "test" ? "ATEVE_TEST_API_KEY or ATEVE_API_KEY" : "ATEVE_API_KEY";
  throw new Error(`Set ${variable} to a key for ${environment}`);
}

const baseUrl = environment === "production" ? "https://api.ateve.ai" : "https://api-test.ateve.ai";
const decisions = {
  state: { amount: 75 },
  questions: {
    category: { type: "choice", criteria: { below: "Less than 100", other: "At least 100" } },
    rating: { type: "score", criteria: ["Below 50", "Between 50 and 100", "Above 100"] },
    belowLimit: { type: "noul", instructions: "Is the amount below 100?" },
  },
};

const checks = [
  {
    path: "/v1/fetch",
    schema: "FetchResponse",
    request: { schema: "FetchRequest", body: { url: "https://example.com/" } },
    verify: (body: unknown) => {
      assert.ok(
        (body as { content: string }).content.trim().length > 0,
        "Fetch returned empty content",
      );
    },
  },
  {
    path: "/v1/systemone",
    schema: "DecisionResponse",
    request: { schema: "DecisionRequest", body: decisions },
    verify: (body: unknown) => {
      const { answers, usage } = body as {
        answers: Record<string, { type: string }>;
        usage: { output_tokens: number };
      };
      assert.deepEqual(Object.keys(answers).sort(), Object.keys(decisions.questions).sort());
      for (const [id, question] of Object.entries(decisions.questions)) {
        assert.equal(answers[id].type, question.type);
      }
      assert.equal(usage.output_tokens, 0);
    },
  },
  {
    path: "/v1/models",
    schema: "ListModelsResponse",
    verify: (body: unknown) => {
      assert.ok((body as { models: unknown[] }).models.length > 0, "No models were returned");
    },
  },
];

for (const { path, schema, request, verify } of checks) {
  try {
    if (request) validateAgainstContract(request.schema, request.body);
    const response = await fetch(baseUrl + path, {
      method: request ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(request && { "Content-Type": "application/json" }),
      },
      body: request ? JSON.stringify(request.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(70_000),
    });
    const requestId = response.headers.get("X-Request-Id") ?? "missing";
    if (response.status !== 200) {
      const envelope = (await response.json().catch(() => undefined)) as
        | { id?: string; error?: { code?: string } }
        | undefined;
      throw new Error(
        `HTTP ${response.status}, ${envelope?.error?.code ?? "unknown error"}, request ID ${envelope?.id ?? requestId}`,
      );
    }
    const body: unknown = await response.json();
    validateAgainstContract(schema, body);
    verify(body);
    console.log(`${path}: HTTP 200, contract valid, request ID ${requestId}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.replaceAll(key, "[redacted]") : "request failed";
    console.error(`${path}: ${message}`);
    process.exitCode = 1;
  }
}
