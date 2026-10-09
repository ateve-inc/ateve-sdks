import { root } from "./generator.ts";
import { checkVersions } from "./versioning.ts";

if (process.env.GITHUB_REF_TYPE === "tag" && !process.env.GITHUB_REF_NAME)
  throw new Error("GITHUB_REF_NAME is required for release version validation.");
const version = checkVersions(
  root,
  process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined,
);
console.log(`All SDK versions match ${version}.`);
