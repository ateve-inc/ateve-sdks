import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { root } from "./generator.ts";
import { checkVersions, nextVersion, pythonVersion, versionTargets } from "./versioning.ts";

const template = "### Added\n\n- TODO\n\n### Changed\n\n- TODO\n\n### Fixed\n\n- TODO\n";

export function appendChangelog(content: string, version: string): string {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^## (?:\\[)?${escaped}(?:\\]|\\s|$)`, "m").test(content))
    throw new Error(`Changelog already contains version ${version}.`);
  if (/^## Unreleased[ \t]*$/m.test(content))
    return content.replace(/^## Unreleased[ \t]*$/m, `## ${version} — Unreleased`);
  const firstEntry = content.search(/^## /m);
  const entry = `## ${version} — Unreleased\n\n${template}\n`;
  if (firstEntry !== -1) return content.slice(0, firstEntry) + entry + content.slice(firstEntry);
  if (!/^# Changelog[ \t]*$/m.test(content)) throw new Error("Expected a Changelog heading.");
  return `${content.trimEnd()}\n\n${entry}`;
}

export function bumpWorkspace(base: string, args: string[]): string {
  const current = checkVersions(base);
  const version = nextVersion(current, args);
  const changes = versionTargets.map((target) => {
    const file = path.join(base, target.file);
    const before = readFileSync(file, "utf8");
    const value = target.python ? pythonVersion(version) : version;
    const after = before.replace(
      target.pattern,
      (_match, prefix: string, _old: string, suffix: string) => `${prefix}${value}${suffix}`,
    );
    return { file, before, after };
  });
  const file = path.join(base, "CHANGELOG.md");
  const before = readFileSync(file, "utf8");
  changes.push({ file, before, after: appendChangelog(before, version) });

  const written: typeof changes = [];
  try {
    for (const change of changes) {
      written.push(change);
      writeFileSync(change.file, change.after);
    }
  } catch (error) {
    const errors: unknown[] = [error];
    for (const change of written.reverse()) {
      try {
        writeFileSync(change.file, change.before);
      } catch (restoreError) {
        errors.push(restoreError);
      }
    }
    throw new AggregateError(errors, "Version bump failed; attempted to restore original files.");
  }
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: pnpm version:bump [--patch|--minor|--major|--x.y.z[-alpha|beta|rc.N]] [--alpha|--beta|--rc|--tag alpha|beta|rc]",
    );
  } else {
    const version = bumpWorkspace(root, args);
    console.log(
      `All SDKs updated to ${version} (Python ${pythonVersion(version)}). Fill in CHANGELOG.md before publishing.`,
    );
  }
}
