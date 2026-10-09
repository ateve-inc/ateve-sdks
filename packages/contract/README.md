# SDK API contract

`openapi.json` is an OpenAPI 3.1.0 document. Request models reflect the October
2026 update: `max_results` replaces `limit`/`offset`, and the API uses `content`
(singular). `content.snippet` defaults to true. Full text is requested through
the optional `content.text` object; its `format` defaults to `text`, and
`max_characters` lives inside that object. Request summary/highlights options
have been removed.

Success response models were verified against live requests on October 9, 2026.
The response contains `id`, `created`, `latency_ms`, `query.original`, `results`,
and optional `total_estimated_matches`. Per-result extracted content is returned
as `text` for both formats. Extraction failure produces `text: null`; without
a text request, the field is omitted. Snippets may coexist with text and are
omitted when `content.snippet` is false. The obsolete answer, usage, news/video,
query tuning, raw_content, summary, highlights, site_name and language fields
and unused nested models have been removed.

The `live-*-response.json` fixtures capture these observed shapes with synthetic
request IDs. A permission-error fixture records the observed `team_not_allowed`
envelope. No API keys are stored. The local documentation repository currently
describes a separate `markdown` response field and snippet replacement; live
responses use `text` and preserve snippets, so this contract follows live behavior.
This private workspace is not published and is not an SDK runtime dependency.

## Changing a model

1. Edit a named schema in `openapi.json`. Wire fields use snake_case.
2. Set `x-sdk-kind` to `request` or `response` on object models. Reference
   named nested objects/enums with `$ref` rather than inline definitions.
3. Add bindings only for language-specific behavior. Keys are
   `Model.wire_field`; unknown keys fail validation.
4. Adjust a validation hook when the change affects its behavior.
5. Run `pnpm generate` and `pnpm check` from the root; review the contract
   and all generated changes together.

Models are discovered from `components.schemas`. New Python models are
automatically re-exported from `ateve`, TS interfaces from `ateve`, and Java
classes from `ai.ateve.models`. Error schemas describe the existing protocol
but do not generate replacements for handwritten exceptions.

Primitive and referenced enum `default` values remain optional protocol fields.
Python models and Java builders initialize these defaults. JavaScript applies
the same defaults during serialization. Omitted `content` and `text` objects
stay omitted, so default options do not enable full-text retrieval.

## Compatibility differences

| Behavior                       | JavaScript                 | Python                               | Java                                       |
| ------------------------------ | -------------------------- | ------------------------------------ | ------------------------------------------ |
| Public field names             | camelCase                  | snake_case                           | camelCase                                  |
| `published_at`                 | ISO string                 | `datetime`                           | `Instant`; existing millisecond serializer |
| Missing result images          | `[]`                       | `[]`                                 | `null`                                     |
| Missing image width/height/alt | normalized to `null`       | default `None`                       | `null`                                     |
| Unknown response fields        | omitted                    | retained by Pydantic                 | ignored by Jackson                         |
| Requests                       | existing client validation | frozen Pydantic; forbid extra fields | immutable Builder snapshots                |

Optional and nullable protocol fields are distinct. Python's default `None`
and non-strict coercions remain supported; `max_characters` stays strict.
Calendar, whitespace, timezone and malformed-data handling remain specific to
each SDK. This refactor does not normalize these differences.

`golden-response.json` is shared by JS/Python; Java's original example values
are retained in `golden-response-java.json`. All fixtures validate against the
same contract.
