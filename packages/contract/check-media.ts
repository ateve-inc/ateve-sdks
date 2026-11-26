import assert from "node:assert/strict";
import { validateAgainstContract } from "./validation.ts";

const environment = process.argv[2];
if (environment !== "test" && environment !== "preview" && environment !== "production")
  throw new Error("Select the test, preview or production environment");
const keyVariable = environment === "preview" ? "ATEVE_PREVIEW_API_KEY" : "ATEVE_API_KEY";
const key = process.env[keyVariable]?.trim();
if (!key) throw new Error(`Set ${keyVariable} to a key for ${environment}`);
const baseUrl =
  environment === "production" ? "https://api.ateve.ai" : `https://api-${environment}.ateve.ai`;

const request = { query: "James Webb Space Telescope", max_results: 1 };
for (const [resource, model] of [
  ["images", "ImageSearch"],
  ["videos", "VideoSearch"],
]) {
  try {
    validateAgainstContract(model + "Request", request);
    const response: Response = await fetch(`${baseUrl}/v1/${resource}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const body: unknown = await response.json();
    if (response.status !== 200) {
      validateAgainstContract("ErrorResponse", body);
      const { id, error } = body as { id?: string; error?: { code?: string } };
      throw new Error(
        `HTTP ${response.status}, ${error?.code ?? "unknown error"}, request ID ${id ?? response.headers.get("X-Request-Id") ?? "unknown"}`,
      );
    }
    validateAgainstContract(model + "Response", body);
    const { query, results } = body as { query: { original: string }; results: unknown[] };
    assert.ok(query.original === request.query, "Response query did not match the request");
    assert.ok(results.length <= request.max_results, "Response exceeded max_results");
    console.log(`/v1/${resource}: HTTP 200, contract valid, ${results.length} result(s)`);
  } catch (error) {
    console.error(
      `/v1/${resource}: ${error instanceof Error ? error.message.replaceAll(key, "[redacted]") : "request failed"}`,
    );
    process.exitCode = 1;
  }
}
