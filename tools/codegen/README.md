# Model generation

This private TypeScript ESM tool generates models only. HTTP, exceptions, parsing
and client configuration stay in the SDKs. It has no runtime dependencies.
Templates contain model layout and behavior hooks, not field definitions.

Node.js 24+ runs `.ts` files directly with native type stripping. There is no
transpilation or runtime loader; imports use explicit `.ts` extensions and
type-only imports use `import type`. `pnpm --filter @ateve/codegen typecheck`
checks scripts, generator tests and the contract fixture validator with strict
TypeScript and `erasableSyntaxOnly`. Node does not typecheck at runtime.

Supported structures: named string enums and object models, local `$ref`,
strings, booleans, integers (`int64`), numbers, arrays, unstructured string-keyed
maps, primitive-plus-null unions and `date-time`. Request constraints support
minimum/maximum, string length, array maximum length and patterns. Composition,
inline models and unsupported keywords fail explicitly; extend the generator
and tests before using them.

Primitive and referenced string enum defaults are supported and validated
against their types, enum values and numeric bounds. TS types document defaults;
Python models and Java builders initialize them without making fields required.

Python hooks retain the existing helpers/base classes and decorated validators.
Java Builder hooks retain calendar, timezone and validation behavior; numeric
limits and patterns are substituted from the contract. New fields are rendered
from the contract; special behavior still needs a hook when applicable.

`build` writes candidates under the ignored `generated/` directory. Each SDK
synchronizes only its own files, tracked by `.generated-models.json`. Stale
generated files are removed; cleanup refuses to remove handwritten files.
`generate:check` renders into memory and compares files/manifests. It never
writes SDK files or uses cached check results. Tests/builds do not generate models.

Root tasks use `src/turbo.ts` to include OS, architecture and actual toolchain
versions in cache keys. Generation caches candidates and SDK outputs; builds
cache `dist`/`target`. Environments, test reports and Maven files containing
checkout paths are excluded. Tests and generated-file comparisons are uncached.
Contract/templates invalidate candidate generation; generated model changes
invalidate language checks/builds. Shared fixtures invalidate consumers.
Remote caching is not configured.
Native Python tasks also hash the root uv workspace metadata and dependency
lockfile. Python build caching is explicitly enabled for Hatchling because
the build uses the already synced, locked backend without build isolation;
wheel/sdist files stay in `packages/python/dist`, and `.venv` is never cached.
Automatic `AGENTS.md` updates are disabled with `agentGuidance: false` so
validation commands do not modify repository guidance files.

Root oxfmt tasks are uncached. Formatting excludes generated models and
`.generated-models.json` manifests so `generate:check` keeps comparing the
generator's exact output. Formatting scripts and templates never automatically
regenerate models; run the read-only drift check after changing tooling.

After the root build, run `node tools/codegen/src/check-artifacts.ts` from
the root to verify npm ESM/CJS, Python wheel/sdist and Java JAR content and
run packaged-client smoke calls. It uses temporary files and a local HTTP
server, never the production API.

`src/release.ts` resolves an existing `v*` tag to its commit and rejects a tag
that differs from the workflow's source commit. The release workflow passes
that commit to CI and Java publishing; npm/Python consume CI artifacts. Version
validation continues to use `src/versions.ts` with `GITHUB_REF_TYPE=tag` and
`GITHUB_REF_NAME` for automatic releases and manual retries. See the root
[release instructions](../../README.md#validation-and-release) for OIDC setup.

`src/versioning.ts` defines the shared version targets and maps SemVer
prereleases to Python's canonical spelling. `src/version-bump.ts`, exposed as
`pnpm version:bump`, validates all current versions and arguments before editing
those targets and adding a changelog draft. It updates only the local package's
version in `uv.lock`; dependency resolutions stay unchanged. The existing
`src/versions.ts` check and release dist-tag selection share these rules.
