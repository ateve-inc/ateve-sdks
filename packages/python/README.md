# Ateve Python SDK

Official typed client for `POST /v1/search`. Requires Python 3.11+.

## Install

```bash
pip install ateve
```

## Synchronous

```python
from ateve import Ateve, ContentFormat, ContentOptions, TextOptions

with Ateve() as client:  # reads ATEVE_API_KEY
    response = client.search(
        query="quantum computing",
        date_range="week",
        max_results=10,
        content=ContentOptions(text=TextOptions(format=ContentFormat.MARKDOWN, max_characters=8000)),
    )
    print(response.results[0].title, response.results[0].text)
```

## Asynchronous

```python
from ateve import AsyncAteve

async with AsyncAteve() as client:
    response = await client.search("quantum computing", max_results=10)
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

Use `max_results` (1–100, default 10); `limit` and `offset` have been removed.
`ContentOptions.snippet` is optional and defaults to `True`. To retrieve full
text, pass `content=ContentOptions(text=TextOptions())`, or configure
`TextOptions(max_characters=8000, format=ContentFormat.MARKDOWN)`.
`format` accepts `"text"` (default) or `"markdown"`. Omitting `text` does not
request full text. `max_characters` remains a strict positive signed 32-bit
integer; its server default is 5000 per result, applied after format conversion.
Use `content=ContentOptions(highlights=True)` to receive query-relevant excerpts
in `SearchResult.highlights` (`list[str]`, or `None` when absent). Highlights
default to `False` and can coexist with snippets and full text. They focus on
evidence that directly supports answers, reducing unrelated information compared
with snippets. `summary` has been removed from `ContentOptions`; `favicon`
remains optional. Both synchronous and asynchronous clients accept `content`
and `max_results`, or a `SearchRequest` instance.

Both formats return content in `SearchResult.text`. It defaults to `None` when
absent or when extraction fails; `model_fields_set` distinguishes those cases.
Snippets may coexist with text; set `ContentOptions(snippet=False)` to omit
them. Obsolete answer, usage, news/video, query tuning and raw content/summary
response fields and models have been removed. Unknown response
fields continue to be retained by Pydantic for forward compatibility.
