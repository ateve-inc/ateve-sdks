import { mkdirSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { root, render, validate, loadContract, readJson } from "./generator.ts";
import { synchronize } from "./files.ts";
import { languages } from "./types.ts";
import type { Language, ModelFiles } from "./types.ts";

const [command, argument] = process.argv.slice(2);
function isLanguage(value: string): value is Language {
  return languages.some((language) => language === value);
}
if (argument && !isLanguage(argument)) throw new Error(`Unknown language ${argument}`);
const language = argument as Language | undefined;
const [api, bindings] = loadContract();
if (command === "validate") {
  validate(api, bindings);
  console.log("Contract and language bindings are valid.");
} else if (command === "build") {
  const output = render(api, bindings);
  const base = path.join(root, "tools/codegen/generated");
  rmSync(base, { recursive: true, force: true });
  for (const [lang, files] of Object.entries(output)) {
    mkdirSync(path.join(base, lang), { recursive: true });
    synchronize(path.join(base, lang), files);
  }
} else if (command === "sync" && language) {
  const base = path.join(root, "tools/codegen/generated", language);
  const files: ModelFiles = Object.fromEntries(
    readJson<string[]>(path.join(base, ".generated-models.json")).map((file) => [
      file,
      readFileSync(path.join(base, file), "utf8"),
    ]),
  );
  synchronize(path.join(root, "packages", language), files);
} else if (command === "check") {
  const output = render(api, bindings);
  for (const lang of language ? [language] : languages)
    synchronize(path.join(root, "packages", lang), output[lang], true);
  console.log("Generated models match the contract.");
} else throw new Error("Usage: cli.ts validate|build|check [js|python|java], or sync <language>");
