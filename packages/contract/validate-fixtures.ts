import { readFileSync } from "node:fs";
import { validateAgainstContract } from "./validation.ts";
for (const [fixture, model] of [
  ["golden-request", "SearchRequest"],
  ["default-request", "SearchRequest"],
  ["golden-response", "SearchResponse"],
  ["golden-response-java", "SearchResponse"],
  ["live-default-response", "SearchResponse"],
  ["live-text-response", "SearchResponse"],
  ["live-markdown-response", "SearchResponse"],
  ["live-no-snippet-response", "SearchResponse"],
  ["live-highlights-response", "SearchResponse"],
  ["live-highlights-no-snippet-response", "SearchResponse"],
  ["live-highlights-markdown-response", "SearchResponse"],
  ["error-400", "ErrorResponse"],
  ["error-401", "ErrorResponse"],
  ["error-429", "ErrorResponse"],
  ["error-team-not-allowed", "ErrorResponse"],
]) {
  const data = JSON.parse(
    readFileSync(new URL(`fixtures/${fixture}.json`, import.meta.url), "utf8"),
  );
  try {
    validateAgainstContract(model, data);
  } catch (error) {
    throw new Error(`${fixture}: ${error instanceof Error ? error.message : "Invalid fixture"}`);
  }
}
console.log("Shared wire fixtures match the contract.");
