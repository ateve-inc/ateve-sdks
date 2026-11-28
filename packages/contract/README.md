# SDK API contract

`openapi.json` is an OpenAPI 3.1.0 document. Web search requests use `max_results` and
`content`. Request full text through the optional `content.text` object.
Its `format` defaults to `text`, and `max_characters` limits the length per
result after format conversion. Set `content.highlights` to true to request
concise, query-relevant excerpts. Highlights are disabled by default.

The response contains `id`, `created`, `latency_ms`, `query.original`, and `results`.
Each result includes `snippet`. When requested, `highlights` (`string[]`) and
extracted `text` can appear alongside it. Both text formats use the same
`text` field. Extraction failure produces `text: null`. The API omits `text`
when the request omits `content.text`. The obsolete answer, usage, news/video,
query tuning, `raw_content`, `summary`, `site_name` and `language` fields and
unused nested models have been removed.

The `live-*-response.json` fixtures capture response shapes with synthetic
request IDs. Historical fixtures without snippets cover compatibility with
older responses. A permission-error fixture records the observed
`team_not_allowed` envelope. This private workspace is used at build time.

`validation.ts` supplies the same OpenAPI-backed validator to fixture checks and
`pnpm --filter @ateve/contract live:check`. The live check requires `ATEVE_API_KEY`
and validates requests plus raw successful responses before checking content
behavior. It checks each API against `https://api.ateve.ai` and validates responses
before normalization. See the [production contract checks](../../README.md#validation-and-release)
for coverage.
The check writes neither keys nor response bodies to disk. CI runs it once
outside the language matrix and injects the Actions secret only into that step.

## Media search

`POST /v1/images` and `POST /v1/videos` each define their own request, result and
response schemas. Both accept `query` and optional `max_results` (1–10).
The server supplies the default limit when the caller omits it. The
`images-response.json` and `videos-response.json` fixtures are synthetic examples
used by the SDK regression tests. Run [the test-environment media check](../../README.md#image-and-video-search-in-test) to validate real responses for both routes.

## Fetch API

`POST /v1/fetch` accepts a single page URL. The response returns a Markdown
body and a title. A missing title is represented by an empty string. The
`fetch-response.json` fixture exercises newlines, a table and a fenced code block.

## Decisions API

`POST /v1/systemone` represents Choice, Score and Noul questions and answers
as unions keyed by `type`. The maps in
`DecisionRequest.questions` and `DecisionResponse.answers` carry caller-defined
IDs. The request fixture includes explicit null values inside criteria and
state. `GET /v1/models` lists the available model IDs and aliases.
The model-list response fixture includes a primary model and an alias.

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
