import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import type { Contract } from "../../tools/codegen/src/types.ts";

const api: Contract = JSON.parse(readFileSync(new URL("openapi.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
// ajv-formats exposes .default for native ESM / NodeNext interoperability.
addFormats.default(ajv);
// The contract document keeps local OpenAPI refs; register a JSON Schema root
// with the same components so fixtures are checked against the same definitions.
ajv.addSchema({ $id: "ateve-contract", components: api.components });
for (const [fixture, model] of [
  ["golden-response", "SearchResponse"],
  ["golden-response-java", "SearchResponse"],
  ["error-400", "ErrorResponse"],
  ["error-401", "ErrorResponse"],
  ["error-429", "ErrorResponse"],
]) {
  const validate = ajv.compile({ $ref: `ateve-contract#/components/schemas/${model}` });
  const data = JSON.parse(
    readFileSync(new URL(`fixtures/${fixture}.json`, import.meta.url), "utf8"),
  );
  if (!validate(data)) throw new Error(`${fixture}: ${ajv.errorsText(validate.errors)}`);
}
console.log("Shared wire fixtures match the contract.");
