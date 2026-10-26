import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import type { Contract } from "../../tools/codegen/src/types.ts";

const api: Contract = JSON.parse(readFileSync(new URL("openapi.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
// ajv-formats exposes .default for native ESM / NodeNext interoperability.
addFormats.default(ajv);
ajv.addSchema({ $id: "ateve-contract", components: api.components });
const validators = new Map(
  Object.keys(api.components.schemas).map((model) => [
    model,
    ajv.compile({ $ref: `ateve-contract#/components/schemas/${model}` }),
  ]),
);

export function validateAgainstContract(model: string, data: unknown): void {
  const validate = validators.get(model);
  if (!validate) throw new Error(`Unknown contract model: ${model}`);
  if (!validate(data)) throw new Error(`${model}: ${ajv.errorsText(validate.errors)}`);
}
