import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { distTag } from "./versioning.ts";

export function resolveReleaseTag(tag: string, cwd: string, expectedCommit?: string): string {
  if (!tag.startsWith("v")) throw new Error("A release tag starting with v is required.");
  distTag(tag.slice(1));
  const ref = `refs/tags/${tag}`;
  const git = (args: string[]): string =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["check-ref-format", ref]);
  const commit = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  if (expectedCommit && commit !== expectedCommit)
    throw new Error(
      "The release tag no longer points at the commit that triggered this run. For a manual release, select the same tag as the workflow ref (--ref).",
    );
  return commit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.env.RELEASE_TAG ?? "";
  const commit = resolveReleaseTag(tag, process.cwd(), process.env.RELEASE_COMMIT);
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `ref=${commit}\nrelease_tag=${tag}\ndist_tag=${distTag(tag.slice(1))}\n`,
  );
  console.log(`Release ${tag} resolved to ${commit}.`);
}
