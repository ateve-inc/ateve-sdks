import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveReleaseTag } from "../src/release.ts";
import { root, readJson } from "../src/generator.ts";

test("release resolution requires a tag and pins its peeled commit", (t) => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "ateve-release-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Initial",
  );
  const commit = git("rev-parse", "HEAD");
  git("tag", "v0.1.0");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "tag",
    "-a",
    "v0.2.0",
    "-m",
    "Annotated",
  );
  git("branch", "v0.3.0");
  git("tag", "v0.2.0-beta.1");

  assert.equal(resolveReleaseTag("v0.1.0", cwd, commit), commit);
  assert.equal(resolveReleaseTag("v0.2.0", cwd), commit);
  assert.equal(resolveReleaseTag("v0.2.0-beta.1", cwd), commit);
  const output = path.join(cwd, "release-output");
  const resolved = spawnSync(process.execPath, [path.join(root, "tools/codegen/src/release.ts")], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_TAG: "v0.2.0-beta.1",
      RELEASE_COMMIT: commit,
      GITHUB_OUTPUT: output,
    },
  });
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.equal(
    readFileSync(output, "utf8"),
    `ref=${commit}\nrelease_tag=v0.2.0-beta.1\ndist_tag=beta\n`,
  );
  for (const tag of ["", "main", commit, "v0.3.0", "v0.4.0", "v0.1.0\nref=main", "v../main"])
    assert.throws(() => resolveReleaseTag(tag, cwd));

  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Next",
  );
  const movedCommit = git("rev-parse", "HEAD");
  git("tag", "--force", "v0.1.0");
  assert.throws(() => resolveReleaseTag("v0.1.0", cwd, commit), /no longer points/);
  assert.equal(resolveReleaseTag("v0.1.0", cwd, movedCommit), movedCommit);
});

test("manual release tags use the same version check as tag pushes", () => {
  const { version } = readJson<{ version: string }>(path.join(root, "packages/js/package.json"));
  const run = (tag: string) =>
    spawnSync(process.execPath, ["tools/codegen/src/versions.ts"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: tag },
    });
  const valid = run(`v${version}`);
  assert.equal(valid.status, 0, valid.stderr);
  const invalid = run("v999.999.999");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Release tag version .* differs from SDK version/);
});
