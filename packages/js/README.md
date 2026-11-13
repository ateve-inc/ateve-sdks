# Ateve JavaScript / TypeScript SDK

Official zero-runtime-dependency client for `POST /v1/search`. Requires Node.js
22+ and ships ESM, CommonJS, and TypeScript declarations.

## Install

```bash
npm install ateve
```

Development uses TypeScript 7 for typechecking. The build enables
`isolatedDeclarations` so tsdown generates ESM/CommonJS declarations with Oxc
without requiring the classic TypeScript compiler API. Package checks compile
consumers against both declaration entry points with TypeScript 7.

## Use

```ts
import Ateve from "ateve";

const client = new Ateve(); // reads ATEVE_API_KEY
const response = await client.search({
  query: "quantum computing",
  dateRange: "week",
  maxResults: 10,
  content: { text: { format: "markdown", maxCharacters: 8000 } },
});

console.log(response.results[0]?.title, response.results[0]?.text);
```

The client uses native `fetch`, sends camelCase SDK options as snake_case JSON,
and returns typed camelCase response data. A custom `fetch` can be injected for
proxying, tracing, testing, or host-managed transport policy.

Each call sends exactly one HTTP request. There are no automatic retries,
backoff, or endpoint failover because a timeout/reset may occur after the
billable search already executed. `ApiConnectionError.requestMayHaveBeenSent`
is false only for pre-dispatch cancellation and known DNS/connect/TLS failures;
unknown fetch failures remain conservatively true.

Defaults are a 60-second timeout, a 32 MiB streamed response cap, and manual
redirect handling so the bearer credential is not forwarded to another
origin. Pass `{ signal }` as the second argument to cancel a request, and
`maxConcurrentRequests` to enable a fail-fast client bulkhead.

Typed errors include `AuthenticationError`, `PaymentRequiredError`,
`RateLimitError`, `InvalidRequestError`, `ServerError`,
`ApiConnectionError`, `ApiResponseError`, and `ConcurrencyLimitError`.
`RateLimitError` preserves `retryAfterSeconds` and `limitScope`.

## Search contract limits

Use `maxResults` to set the maximum number of results (1–100, default 10).
`limit` and `offset` have been removed.

Snippets are always returned and cannot be disabled. To request full text, pass
`content: { text: {} }`. To customize the output, use
`content: { text: { maxCharacters: 8000, format: "markdown" } }`.
`format` accepts `"text"` (default) or `"markdown"`. Full text is requested only
when `text` is supplied. `maxCharacters` must be a positive signed 32-bit integer.
The server default is 5,000 characters per result, applied after format conversion.
Both formats return content in `results[].text`, which is omitted when full text
isn't requested and `null` when extraction fails. Full text is returned alongside
snippets.

Highlights are optional and disabled by default. Set `content: { highlights: true }`
to return concise, query-relevant excerpts in addition to snippets.
`results[].highlights` is a `string[]` when present and `undefined` when absent.
Highlights can coexist with snippets and full text.

For token-efficient workflows, your agent can prioritize highlights when building
model context and supplement them with snippets when additional context is needed.
When the API returns both fields, token savings depend on which content your
agent passes to the model.

`summary` and the snippet toggle have been removed from `ContentOptions`.
`favicon` remains optional under `content`. Responses contain `query.original`,
`results` and request metadata. Obsolete answer, usage, news/video, query tuning,
and raw content/summary response fields and models have been removed.
