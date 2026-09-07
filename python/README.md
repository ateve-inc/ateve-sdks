# Ateve Python SDK

Official typed client for `POST /v1/search`. Requires Python 3.11+.

## Install

```bash
pip install ateve
```

## Synchronous

```python
from ateve import Ateve, ContentOptions

with Ateve() as client:  # reads ATEVE_API_KEY
    response = client.search(
        query="quantum computing",
        date_range="week",
        content=ContentOptions(summary=True, highlights=True),
    )
    print(response.results[0].title, response.usage.credits)
```

## Asynchronous

```python
from ateve import AsyncAteve

async with AsyncAteve() as client:
    response = await client.search("quantum computing", limit=10)
```

`Ateve` owns and closes its default `httpx.Client`; `AsyncAteve` does the same
for its default `httpx.AsyncClient`. An injected `http_client` is borrowed and
never closed by the SDK. Reuse one Ateve client for its connection pool instead
of constructing one per request.

Each `search` call sends exactly one HTTP request. The SDK never retries,
backs off, or switches endpoints. This is intentional: a timeout/reset can
happen after the billable search already ran. `ApiConnectionError` exposes
`request_may_have_been_sent`; only DNS/connect/connect-timeout/pool-timeout
failures are classified as definitely not sent.

The built-in path defaults to a 60-second request timeout, 5-second connect
timeout, a 32 MiB response cap, and no redirects. Use
`max_concurrent_requests` for an optional fail-fast bulkhead.

Typed errors include `AuthenticationError`, `PaymentRequiredError`,
`RateLimitError`, `InvalidRequestError`, `ServerError`,
`ApiConnectionError`, `ApiResponseError`, and `ConcurrencyLimitError`.
`RateLimitError` preserves `retry_after_seconds` and `limit_scope`; retry
decisions remain caller-owned.

## Search contract limits

Only the first 100 results are accessible: offset 0–99, limit 1–50. Pages crossing depth 100 are truncated. The content character limit defaults to 5000 per raw_content, after output format conversion; it does not enable raw_content. Use `ContentOptions(raw_content=True, max_characters=8000)`. The limit is a positive signed 32-bit integer with no fixed business cap.
