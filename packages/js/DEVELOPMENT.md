# JavaScript SDK development

The transport creates an isolated `ofetch@2.0.0-alpha.3` instance over native
`fetch`. Shared request and response interceptors handle authentication,
streamed body limits, decoding, and SDK error mapping. The ESM-only dependency
is bundled into both entry points; its license is included in `THIRD_PARTY_NOTICES.txt`.

See the [root development guide](../../README.md) for workspace setup and
checks. API models are generated from the [compatibility contract](../contract/).
Run `pnpm generate` from the repository root after changing models; do not
edit files marked as generated. Published packages include the models.

Run `pnpm --filter @ateve/js lint` for oxlint correctness checks, and
`pnpm --filter @ateve/js typecheck` for TypeScript checks. From the repository
root, `pnpm format` writes oxfmt formatting and `pnpm format:check` checks it;
generated models are excluded from formatting.

`pnpm --filter @ateve/js test` runs Vitest 5, and
`pnpm --filter @ateve/js build` uses tsdown to produce ESM/CommonJS bundles
and separate declarations for each module format, without source maps. Internal modules
separate configuration, request validation, wire serialization, response
normalization, and transport policy; generated public models stay in `src/types.ts`.
