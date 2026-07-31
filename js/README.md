# Ateve JavaScript / TypeScript SDK

Official zero-runtime-dependency client for `POST /v1/search`. Requires Node.js
22+ and ships ESM, CommonJS, and TypeScript declarations.

## Install

```bash
npm install ateve
```

## Use

```ts
import Ateve from "ateve";

const client = new Ateve(); // reads ATEVE_API_KEY
const response = await client.search({
  query: "quantum computing",
  dateRange: "week",
  topic: "news",
  content: { summary: true, highlights: true },
});

console.log(response.results[0]?.title, response.usage?.credits);
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
