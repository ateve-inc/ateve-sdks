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

[`packages/contract/`](packages/contract/) contains an OpenAPI 3.1
**compatibility baseline extracted from SDK 0.1.0**, bindings and fixtures.
This is not the latest authoritative server contract; alignment is separate.

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

All SDKs retain shared versions and `v*` tags. Existing
[Java](.github/workflows/release-java.yml),
[JS](.github/workflows/release-js.yml) and
[Python](.github/workflows/release-python.yml) workflow identities are retained,
with the full CI suite required before publishing. Update all package/client
versions and contract `info.version` together; `pnpm versions:check` checks
consistency and release tags.

The npm workflow packs with pnpm, checks the public package identity in CI,
then publishes that tarball with npm OIDC. For local packaging, use
`pnpm --filter @ateve/js pack`; publish the resulting `ateve-*.tgz` rather
than running `npm publish` on the workspace source manifest.

Java publishing uses `CENTRAL_USERNAME`, `CENTRAL_PASSWORD`, `GPG_PRIVATE_KEY`
and `GPG_PASSPHRASE`. npm/PyPI retain OIDC trusted publishing. This refactor does
not publish or change registry identities.
