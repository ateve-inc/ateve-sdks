# Changelog

## 0.2.1 — 2026-10-26

- Add a required live API contract check to trusted CI and release runs, using
  the `ATEVE_API_KEY` GitHub Actions secret. Reuse the fixture validator for raw
  requests/responses and check content combinations without retries or saved keys.
- Support TypeScript 7 builds by enabling isolated declarations and Oxc declaration
  generation. Verify both published ESM/CommonJS declaration entry points with
  TypeScript 7 consumers.
- Add `content.highlights` (boolean, default `false`) to all three SDKs and the
  shared API contract. Set it to `true` to request query-relevant excerpts that
  directly support answers and reduce unrelated information compared with snippets.
- Expose per-result `highlights` as a string array alongside the existing snippet,
  preserving missing and empty values according to each SDK's model conventions.
- Verify highlights against the live API through JS ESM/CJS, Python sync/async
  and Java sync/async clients. Add captured response fixtures for combinations
  with snippets and Markdown text; clarify that estimated matches may exceed
  the returned result count.

## 0.2.0 — 2026-10-09

This release aligns JavaScript, Python and Java with the live Search API,
introduces shared model generation, and unifies versioning and release workflows.
The request and response model changes require migration from 0.1.0.

### Search API changes

- Replace `limit` and `offset` with `max_results`: 1–100 results, default 10.
- Use the singular `content` request object, matching the actual API.
- Make `content.snippet` optional with a default of `true`.
- Request extracted content through an optional `content.text` object. Its
  `format` accepts `text` or `markdown` and defaults to `text`; `max_characters`
  moves inside that object and retains the server default of 5000.
- Remove the `content.summary` and `content.highlights` request options.
- Align response models with verified live responses. Both text formats return
  extracted content in `results[].text`; it is omitted when not requested and
  may be `null` when extraction fails. Snippets can coexist with extracted text
  and are omitted when `content.snippet` is `false`.
- Remove unsupported response fields, including top-level `answer`, `news`,
  `images`, `videos` and `usage`; query tuning fields; and result `raw_content`,
  `summary`, `highlights`, `site_name` and `language`. Per-result `images` remain
  supported. Remove the unused `AnswerBlock`, `Citation`, `Usage`,
  `UsageBreakdown` and `VideoItem` model exports.

### SDK and tooling changes

- Generate the three SDKs' public API models from a shared OpenAPI contract,
  with checks for model drift and tests against shared and captured response
  fixtures. Preserve language-specific naming, dates, null handling and
  validation behavior.
- Move SDK sources into `packages/js`, `packages/python` and `packages/java`.
  Add a pnpm/uv/Turborepo workspace with frozen dependency installs, unified
  checks, toolchain-aware caching and oxlint/oxfmt tooling.
- Refactor the JavaScript transport around a bundled `ofetch` instance and
  build with tsdown. Ship self-contained ESM/CommonJS bundles with matching
  declarations and third-party notices. Search calls still send one request
  without automatic retries.
- Add `pnpm version:bump`: default patch, `--minor`, `--major`, explicit
  `--x.y.z`, and `alpha`/`beta`/`rc` prereleases. Synchronize package, client,
  contract and local lock metadata versions and create a changelog draft.
  Normalize Python prereleases to PEP 440 and check the equivalent shared
  release version across all SDKs.
- Use one full compatibility matrix before three independent publish jobs.
  Publish the exact npm/Python artifacts verified by CI; build and sign Java
  from the same checked commit. Manual retries select an existing release tag
  and one SDK, with version/commit checks and concurrency control.
- Prepare npm OIDC trusted publishing with provenance and version-specific
  dist-tags (`latest`, `alpha`, `beta`, `rc`). Keep PyPI OIDC and Maven Central
  signing. Verify packaged clients and their versioned User-Agent headers.

### Migration from 0.1.0

- Replace JS/Java `limit` with `maxResults`, and Python `limit` with
  `max_results`; remove `offset`. Offset-based pagination is no longer exposed.
- Use `content` as the request object name. Set `snippet: false` explicitly
  when snippets are not needed.
- Replace JS/Java `rawContent` and Python `raw_content` flags with a `text`
  options object. Move JS/Java `maxCharacters` and Python `max_characters` into
  that object. Use `TextOptions` in Python/Java and an object literal in JS.
- Set the nested `format` to `text` or `markdown`; read extracted content from
  each result's `text` field for either format. Remove references to deleted
  request options, response fields and model exports.
- Update repository paths and native build commands for the new `packages/`
  layout. Published package identities remain npm/PyPI `ateve` and Maven
  `ai.ateve:ateve-java`; installing SDKs does not require the monorepo tooling.
- Configure npm's trusted publisher for `ateve-inc/ateve-sdks`, calling workflow
  `release-python.yml`, no npm environment, and the `npm publish` allowed action.
  See the root README for the full setup and manual retry command.

## 0.1.0 — 2026-09-08

This release aligns all SDKs with the updated Search API contract.

### Migration from 0.0.1

- Remove `topic` and the `Topic` enum from client code. The API continues to ignore legacy `topic` input.
- Remove the image-count request option. Image quantity is now managed internally by the API.
- Search offsets must be 0–99. The per-page limit remains 1–50; pages crossing result 100 are truncated by the API.
- To configure per-result raw-content length, use Java/JS `maxCharacters` or Python `max_characters` inside content options. The default is 5000 Unicode code points, and the value does not enable raw content automatically.

These request-model changes can require source changes when upgrading from 0.0.1. All three packages share version 0.1.0 and Git tag v0.1.0.
