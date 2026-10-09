# SDK compatibility contract

`openapi.json` is an OpenAPI 3.1.0 document extracted from SDK 0.1.0 models,
serializers, validators and tests. This local compatibility baseline does not
describe the latest authoritative server API; alignment is a separate change.
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
