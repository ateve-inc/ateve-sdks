import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { root } from "../src/generator.ts";
import { appendChangelog, bumpWorkspace } from "../src/version-bump.ts";
import {
  checkVersions,
  distTag,
  nextVersion,
  pythonVersion,
  versionTargets,
} from "../src/versioning.ts";

function workspace(t: TestContext): string {
  const base = mkdtempSync(path.join(os.tmpdir(), "ateve-version-bump-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  for (const target of versionTargets) {
    const file = path.join(base, target.file);
    mkdirSync(path.dirname(file), { recursive: true });
    const content = readFileSync(path.join(root, target.file), "utf8");
    writeFileSync(
      file,
      content.replace(
        target.pattern,
        (_match, prefix: string, _version: string, suffix: string) => `${prefix}0.1.0${suffix}`,
      ),
    );
  }
  writeFileSync(
    path.join(base, "CHANGELOG.md"),
    "# Changelog\n\n## Unreleased\n\n- TODO\n\n## 0.1.0 — 2026-09-08\n\nOriginal notes.\n",
  );
  writeFileSync(path.join(base, "pnpm-lock.yaml"), readFileSync(path.join(root, "pnpm-lock.yaml")));
  return base;
}

function snapshot(base: string): Record<string, string> {
  return Object.fromEntries(
    [...versionTargets.map((target) => target.file), "CHANGELOG.md", "pnpm-lock.yaml"].map(
      (file) => [file, readFileSync(path.join(base, file), "utf8")],
    ),
  );
}

test("bump levels, exact versions and prerelease options select predictable next versions", () => {
  const cases: [string, string[], string][] = [
    ["0.1.0", [], "0.1.1"],
    ["0.1.0", ["--patch"], "0.1.1"],
    ["0.1.0", ["--minor"], "0.2.0"],
    ["0.1.0", ["--major"], "1.0.0"],
    ["0.1.0", ["--2.3.4"], "2.3.4"],
    ["0.1.0", ["--", "--minor"], "0.2.0"],
    ["0.1.0", ["--alpha"], "0.1.1-alpha.1"],
    ["0.1.0", ["--minor", "--beta"], "0.2.0-beta.1"],
    ["0.1.0", ["--major", "--tag", "rc"], "1.0.0-rc.1"],
    ["0.1.0", ["--2.3.4", "--tag=beta"], "2.3.4-beta.1"],
    ["0.1.0", ["--2.3.4-rc.7"], "2.3.4-rc.7"],
    ["1.2.3-alpha.1", ["--alpha"], "1.2.3-alpha.2"],
    ["1.2.3-alpha.9", ["--beta"], "1.2.3-beta.1"],
    ["1.2.3-beta.4", ["--rc"], "1.2.3-rc.1"],
    ["1.2.3-rc.4", [], "1.2.3"],
    ["1.2.3-rc.4", ["--patch"], "1.2.4"],
    ["1.2.3-rc.4", ["--minor", "--alpha"], "1.3.0-alpha.1"],
  ];
  for (const [current, args, expected] of cases)
    assert.equal(nextVersion(current, args), expected, `${current} ${args.join(" ")}`);
});

test("invalid, ambiguous and non-increasing versions are rejected", () => {
  for (const args of [
    ["--minor", "--major"],
    ["--patch", "--1.2.3"],
    ["--alpha", "--beta"],
    ["--tag"],
    ["--tag", "latest"],
    ["--wat"],
    ["--1.2"],
    ["--01.2.3"],
    ["--1.2.3-dev.1"],
    ["--1.2.3+build"],
    ["--1.2.3-rc.01"],
    ["--1.2.3-rc.1", "--alpha"],
    ["--0.1.0"],
    ["--0.0.1"],
    ["1.2.3"],
  ])
    assert.throws(() => nextVersion("0.1.0", args), args.join(" "));
  assert.throws(() => nextVersion("1.2.3-rc.2", ["--beta"]), /greater than/);
  assert.throws(() => nextVersion("1.2.9007199254740991", []), /safe integer/);
});

test("Python prerelease normalization and npm channels match all supported phases", () => {
  for (const [version, expected, channel] of [
    ["1.2.3", "1.2.3", "latest"],
    ["1.2.3-alpha.1", "1.2.3a1", "alpha"],
    ["1.2.3-beta.2", "1.2.3b2", "beta"],
    ["1.2.3-rc.0", "1.2.3rc0", "rc"],
  ]) {
    assert.equal(pythonVersion(version), expected);
    assert.equal(distTag(version), channel);
  }
});

test("bump updates every version, preserves dependencies and historical changelog notes", (t) => {
  const base = workspace(t);
  const before = snapshot(base);
  assert.equal(bumpWorkspace(base, []), "0.1.1");
  assert.equal(checkVersions(base, "v0.1.1"), "0.1.1");
  const after = snapshot(base);
  assert.equal(after["pnpm-lock.yaml"], before["pnpm-lock.yaml"]);
  assert.equal(
    after["uv.lock"],
    before["uv.lock"].replace(
      'name = "ateve"\nversion = "0.1.0"',
      'name = "ateve"\nversion = "0.1.1"',
    ),
  );
  assert.match(after["CHANGELOG.md"], /## 0\.1\.1 — Unreleased\n\n- TODO/);
  assert.ok(after["CHANGELOG.md"].endsWith("## 0.1.0 — 2026-09-08\n\nOriginal notes.\n"));
  assert.equal(bumpWorkspace(base, ["--minor", "--beta"]), "0.2.0-beta.1");
  assert.equal(checkVersions(base, "v0.2.0-beta.1"), "0.2.0-beta.1");
  assert.match(
    readFileSync(path.join(base, "packages/python/pyproject.toml"), "utf8"),
    /^version = "0\.2\.0b1"$/m,
  );
  assert.match(
    readFileSync(path.join(base, "packages/python/src/ateve/_version.py"), "utf8"),
    /^__version__ = "0\.2\.0b1"$/m,
  );
  assert.equal(bumpWorkspace(base, ["--beta"]), "0.2.0-beta.2");
  assert.equal(bumpWorkspace(base, ["--rc"]), "0.2.0-rc.1");
  assert.equal(bumpWorkspace(base, []), "0.2.0");
  assert.equal(checkVersions(base, "v0.2.0"), "0.2.0");
  assert.throws(() => checkVersions(base, "v0.2.1"), /Release tag version/);
});

test("invalid requests, duplicate changelogs and drift fail before writing any file", (t) => {
  const base = workspace(t);
  const before = snapshot(base);
  assert.throws(() => bumpWorkspace(base, ["--major", "--minor"]));
  assert.deepEqual(snapshot(base), before);
  const changelog = path.join(base, "CHANGELOG.md");
  writeFileSync(changelog, before["CHANGELOG.md"] + "\n## 0.1.1 — Unreleased\n");
  const duplicate = snapshot(base);
  assert.throws(() => bumpWorkspace(base, []), /already contains/);
  assert.deepEqual(snapshot(base), duplicate);
  writeFileSync(changelog, before["CHANGELOG.md"]);
  writeFileSync(
    path.join(base, "packages/python/src/ateve/_version.py"),
    '__version__ = "9.0.0"\n',
  );
  const drifted = snapshot(base);
  assert.throws(() => bumpWorkspace(base, []), /differs from SDK version/);
  assert.deepEqual(snapshot(base), drifted);
});

test("changelog prepends a new TODO entry when no unversioned draft exists", () => {
  const old = "# Changelog\n\n## 0.1.0 — 2026-09-08\n\nOriginal notes.\n";
  const updated = appendChangelog(old, "0.1.1");
  assert.match(updated, /^# Changelog\n\n## 0\.1\.1 — Unreleased\n/);
  assert.match(updated, /### Added\n\n- TODO/);
  assert.ok(updated.endsWith(old.slice(old.indexOf("## 0.1.0"))));
  assert.throws(() => appendChangelog(updated, "0.1.1"), /already contains/);
});

test("a write failure restores versions already updated by the command", (t) => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("Requires POSIX file permissions and a non-root user.");
    return;
  }
  const base = workspace(t);
  const before = snapshot(base);
  const file = path.join(base, "packages/java/README.md");
  chmodSync(file, 0o444);
  try {
    assert.throws(() => bumpWorkspace(base, []), /Version bump failed/);
    assert.deepEqual(snapshot(base), before);
  } finally {
    chmodSync(file, 0o644);
  }
});
