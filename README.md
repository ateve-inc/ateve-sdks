# Ateve SDKs

Official SDKs for the Ateve Search API (`POST /v1/search`).

| SDK                     | Directory                              | Registry      | Package               |
| ----------------------- | -------------------------------------- | ------------- | --------------------- |
| Java                    | [`packages/java/`](packages/java/)     | Maven Central | `ai.ateve:ateve-java` |
| JavaScript / TypeScript | [`packages/js/`](packages/js/)         | npm           | `ateve`               |
| Python                  | [`packages/python/`](packages/python/) | PyPI          | `ateve`               |

Each search call sends one HTTP request. Clients do not automatically retry or
fail over: a timeout can occur after a billable search has executed. Retry,
idempotency, circuit breaking and routing remain host-application concerns.

## Development

Requirements: Node.js 24+, the pnpm version pinned in `package.json`, Python
3.11+, uv, JDK 11+ and Maven 3.9+. JDK 17 is suitable for local development;
CI checks JDK 11/17 and Python 3.11/3.14 with Node 24. The pnpm version is
declared in `devEngines.packageManager`, supported by Turborepo 2.11+.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm check
```

Python dependencies are locked in the root `uv.lock`; uv workspace members
share the root `.venv`. JS and tooling share `pnpm-lock.yaml`. Each SDK supports its native workflow:
`pnpm --filter @ateve/js test`, `uv run --locked pytest` inside the Python package,
or `mvn test` inside the Java package.

Turborepo's experimental native Python support discovers `packages/python`
from the root `pyproject.toml`, without a Python `package.json`. Python's
graph identity is `ateve`; the JavaScript workspace uses `@ateve/js` and
`publishConfig.name: ateve` to preserve its public npm name. Java uses its
private task manifest because Turborepo does not yet discover Maven workspaces.
Use `pnpm exec turbo run test --filter=ateve` for Python, or
`pnpm --filter @ateve/js test` for JavaScript.

Python lint/tests use Turbo's detected Ruff/pytest tasks. The custom
`check` command, also reached through `typecheck`, preserves mypy's existing package scope, and `generate`
synchronizes only Python models. Python builds use the locked environment's
Hatchling with `--no-build-isolation`, so cached wheel/sdist outputs include
the build backend version recorded in `uv.lock`.

| Root command                        | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `pnpm generate`                     | Generate and synchronize all three model sets                    |
| `pnpm generate:check`               | Read-only comparison of models and contract                      |
| `pnpm locks:check`                  | Verify uv workspace metadata matches its lockfile                |
| `pnpm versions:check`               | Check package/client/contract versions and release tags          |
| `pnpm version:bump`                 | Bump all SDK versions and add a changelog draft                  |
| `pnpm format` / `pnpm format:check` | Write / check formatting with oxfmt                              |
| `pnpm lint` / `pnpm typecheck`      | Contract, tooling and language checks                            |
| `pnpm test`                         | SDK regression and generator tests, always executed              |
| `pnpm build`                        | npm output, Python wheel/sdist, Java JAR                         |
| `pnpm check`                        | Formatting, version, generation, static checks, tests and builds |

Turborepo orchestrates native tools and caches generation/build outputs. It
does not manage Python/Maven dependencies or change how consumers install SDKs.
Root tasks include actual toolchain versions in cache keys. Tests, model
comparisons, publishing and signing are not cached.

Formatting runs once from the workspace root. `format` and `format:check` are
registered Turbo root tasks with caching disabled; `pnpm check` runs the read-only
formatting task before the other checks, including in PR and release CI.
Oxfmt formats supported files such as JS/TS, JSON, YAML and Markdown. Generated
models and their manifests are excluded to preserve the generator's exact output;
Python and Java source formatting remains outside oxfmt's scope.

JS lint runs oxlint over SDK sources, tests and build configuration, with correctness
rules enforced and warnings rejected. Typechecking remains a separate `tsc --noEmit`
task. Python lint/typecheck run Ruff/mypy; Java runs Maven `validate`/`test-compile`.
Tooling lint checks Node script syntax, and tooling typecheck checks strict TypeScript.

## Shared API models

[`packages/contract/`](packages/contract/) contains the OpenAPI 3.1 contract,
bindings and fixtures. Requests use `max_results` (1–100, default 10) and
`content`, with optional `snippet` (default true) and nested `text` options.
Responses were verified against live requests on October 9, 2026. Both text
formats use the nullable `results[].text` field; obsolete response fields and
unused nested models have been removed. Captured response fixtures cover
default excerpts, plain text, Markdown and disabled snippets.

[`tools/codegen/`](tools/codegen/) generates TS interfaces, Python Pydantic
models and Java Builder/response classes. Generated files are committed:
edit the contract/templates, run `pnpm generate`, review the output and commit
it together. Client options, HTTP and error mapping stay handwritten.
Published SDKs include models and do not depend on the private workspace tools.
Tool scripts are TypeScript ESM, run directly by Node's native type stripping;
the tooling typecheck rejects syntax that requires transformation.

## Validation and release

Migration baseline: 12 JS tests, 16 Python tests, 32 Java tests and existing
JS/Python static checks passed before model replacement. Additional tests
cover generated-file lifecycle and model compatibility.

PR/main CI checks the compatibility matrix, packaged SDKs and whether checks
modified tracked files. Verify packaged code locally after `pnpm build`:

```bash
node tools/codegen/src/check-artifacts.ts
```

All SDKs share release versions and `v*` tags. Use the root command to update
SDK manifests, private workspace manifests, client constants, contract
`info.version`, Java's installation example and the local package version in
`uv.lock` together, then fill in the draft added to [CHANGELOG.md](CHANGELOG.md):

```bash
pnpm version:bump                 # 0.1.0 -> 0.1.1 (default patch)
pnpm version:bump --minor         # 0.1.0 -> 0.2.0
pnpm version:bump --major         # 0.1.0 -> 1.0.0
pnpm version:bump --1.2.3          # explicit higher version
pnpm version:bump --minor --alpha # 0.1.0 -> 0.2.0-alpha.1
pnpm version:bump --tag beta      # alias of --beta
pnpm version:bump --rc            # alias of --tag rc
pnpm version:bump --1.2.3-rc.2     # explicit prerelease and sequence
```

Examples start independently from `0.1.0`. On a prerelease, repeating its tag
increments the sequence (`0.2.0-beta.1` → `0.2.0-beta.2`); moving to a later tag
keeps the release base and starts at 1 (`alpha` → `beta` → `rc`). With no options,
a prerelease becomes its stable release (`0.2.0-rc.1` → `0.2.0`). An explicit
`--patch`, `--minor` or `--major` always increments that component and resets
lower components. A target must be greater than the current version; conflicting
options, version drift and duplicate changelog entries fail before any writes.
Dependency versions and lockfile resolutions are preserved. The command edits
files only; it does not commit, create Git tags or publish packages.

JS, Java and Git tags use `0.2.0-alpha.1`, `0.2.0-beta.1`, `0.2.0-rc.1`.
Python manifests, client constants and lock metadata use the equivalent
`0.2.0a1`, `0.2.0b1`, `0.2.0rc1`, following
[Python version normalization](https://packaging.python.org/en/latest/specifications/version-specifiers/).
`pnpm versions:check` validates this mapping and checks the selected release tag.
Run `pnpm check` before committing the version change and filled release notes.

[Release SDKs](.github/workflows/release-python.yml) is the single release
entry point. Its existing filename and `pypi` environment preserve the PyPI
trusted publisher identity. Pushing a release tag resolves it to a fixed commit,
validates its version, runs the full CI compatibility matrix once, then starts
three independent publishing jobs. Runs for the same tag are serialized.

| SDK                          | Publish job                                            | Authentication                | Build and verification                                                                                        |
| ---------------------------- | ------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| JS/TS (`ateve`)              | [release-js.yml](.github/workflows/release-js.yml)     | npm OIDC with provenance      | Publishes the exact pnpm tarball verified and uploaded by CI                                                  |
| Python (`ateve`)             | Direct job in the release entry point                  | PyPI OIDC, environment `pypi` | Publishes the exact wheel and sdist verified and uploaded by CI                                               |
| Java (`ai.ateve:ateve-java`) | [release-java.yml](.github/workflows/release-java.yml) | Central credentials and GPG   | Builds source/Javadoc artifacts and signs from the same checked commit; CI already ran tests on JDK 11 and 17 |

For a failed registry, retry only that SDK via **Release SDKs → Run workflow**:
select the release tag as the workflow ref, enter that same `release_tag`, and
choose `js`, `python` or `java` for `sdk` (`all` publishes all three). For example:

```bash
gh workflow run release-python.yml --ref v0.2.0 -f release_tag=v0.2.0 -f sdk=js
```

Both automatic releases and manual retries require an existing tag whose version
matches every SDK, and whose commit matches the workflow run. Branches, commit
SHAs, missing tags and a different workflow commit are rejected before publishing.
This also keeps npm/PyPI provenance tied to the source commit actually checked.
The full matrix and package checks still run on a retry. Successfully published
versions cannot be overwritten; retry only the failed SDK.
Workflow fixes take effect only in release tags that contain them. Rerunning an
older tag uses its original workflow definition. Java can instead use the
dedicated recovery workflow below to apply workflow fixes to an existing release.

For npm trusted publishing, configure package **ateve** with:

- Organization: `ateve-inc`
- Repository: `ateve-sdks`
- Workflow filename: **`release-python.yml`** (the calling workflow)
- Environment: leave empty (the npm job has no environment)
- Allowed actions: enable **`npm publish`**

The publishing job uses Node 24, npm 11.5.1 and `id-token: write`, with no npm
write token. npm validates the caller filename when a reusable workflow publishes;
see [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
Prereleases publish under the matching `alpha`, `beta` or `rc` npm dist-tag;
stable releases use `latest`, as described in [npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/).
If a publisher was configured for `release-js.yml`, replace it with the caller
configuration before publishing. Create the configuration near the first publish:
an unvalidated new publisher expires after two days.

PyPI's publishing step stays directly in the entry workflow because
[the PyPI action does not support trusted publishing inside reusable workflows](https://github.com/pypa/gh-action-pypi-publish#trusted-publishing).
Java retains `CENTRAL_USERNAME`, `CENTRAL_PASSWORD`, `GPG_PRIVATE_KEY` and
`GPG_PASSPHRASE`; only its publishing job receives these secrets.
Java publishing pins Maven 3.9.16 and verifies the downloaded binary's SHA-512.
Maven 3.10 writes `maven-metadata-local.xml` into the Central staging directory;
the current publishing plugin includes it in the bundle, which Central rejects
as content without a matching POM. The compatibility checks can still use the
runner's Maven version.

For a failed Java release that needs updated publishing tools, use
[Retry Java release](.github/workflows/release-java-retry.yml). First push the
workflow fixes to `main`, then run the recovery workflow from `main` with the
original release tag:

```bash
gh workflow run release-java-retry.yml --repo ateve-inc/ateve-sdks \
  --ref main -f release_tag=v0.2.0
```

This entry point resolves an existing `v*` tag to a fixed source commit, runs the
full compatibility matrix and package checks against that commit, and publishes
only Java using the current Java workflow. Versions and tags remain unchanged;
JS and Python are not republished. The run uses the same per-tag concurrency
group as Release SDKs. Normal npm/PyPI retries continue to use the original
release workflow so their OIDC provenance stays tied to the checked source.

For local npm packaging, use `pnpm --filter @ateve/js pack`; publish the resulting
`ateve-*.tgz` rather than the workspace source manifest, whose name is `@ateve/js`.
