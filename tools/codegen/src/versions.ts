import { readFileSync } from "node:fs";
import path from "node:path";
import { root, readJson } from "./generator.ts";
import type { Contract } from "./types.ts";

const read = (file: string): string => readFileSync(path.join(root, file), "utf8");
const version = readJson<{ version: string }>(path.join(root, "packages/js/package.json")).version;
const versions: Record<string, string | undefined> = {
  "Python package": read("packages/python/pyproject.toml").match(/^version = "([^"]+)"/m)?.[1],
  "Java package": read("packages/java/pom.xml").match(
    /<artifactId>ateve-java<\/artifactId>\s*<version>([^<]+)<\/version>/,
  )?.[1],
  "JS client": read("packages/js/src/client.ts").match(/VERSION = "([^"]+)"/)?.[1],
  "Python client": read("packages/python/src/ateve/_version.py").match(
    /__version__ = "([^"]+)"/,
  )?.[1],
  "Java client": read("packages/java/src/main/java/ai/ateve/AteveClient.java").match(
    /VERSION = "([^"]+)"/,
  )?.[1],
  Contract: readJson<Contract>(path.join(root, "packages/contract/openapi.json")).info.version,
};
if (process.env.GITHUB_REF_TYPE === "tag")
  versions["Release tag"] = process.env.GITHUB_REF_NAME?.replace(/^v/, "");
for (const [name, value] of Object.entries(versions))
  if (value !== version)
    throw new Error(`${name} version ${value} differs from SDK version ${version}`);
console.log(`All SDK versions match ${version}.`);
