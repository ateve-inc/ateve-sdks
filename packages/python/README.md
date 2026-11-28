# Ateve Python SDK

Official typed client for the Ateve API. Requires Python 3.11+.

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

## Images Search and Videos Search

| Native SDK feature | Status   |
| ------------------ | -------- |
| Images Search      | Released |
| Videos Search      | Released |

## Fetch API

```python
from ateve import Ateve

with Ateve() as client:
    page = client.fetch("https://example.com/")
    print(page.title, page.content)
```

`page.content` contains Markdown. With `AsyncAteve`, call `await client.fetch(url)`.

## Decisions API

```python
from ateve import Ateve, DecisionRequest, NoulAnswer, NoulQuestion

with Ateve() as client:
    result = client.decisions.decide(DecisionRequest(
        state={"amount": 75},
        questions={"below_limit": NoulQuestion(
            type="noul", instructions="Is the amount below 100?"
        )},
    ))
    answer = result.answers["below_limit"]
    if isinstance(answer, NoulAnswer):
        print(answer.noul)
    print(result.usage.input_tokens, client.decisions.list_models().models)
```

Decisions API accepts a mix of `ChoiceQuestion`, `ScoreQuestion` and
`NoulQuestion` in a single request. Omit `model` to use the server default.
With `AsyncAteve`, await `client.decisions.decide(request)` and
`client.decisions.list_models()`.

## Web Search limits

Use `max_results` to set the maximum number of results (1–100, default 10).
`limit` and `offset` have been removed. Both synchronous and asynchronous
clients accept `content` and `max_results`, or a `SearchRequest` instance.

Snippets are always returned and cannot be disabled. To request full text, pass
`content=ContentOptions(text=TextOptions())`. To customize the output, use
`TextOptions(max_characters=8000, format=ContentFormat.MARKDOWN)`.
`format` accepts `ContentFormat.TEXT` (default) or `ContentFormat.MARKDOWN`.
Full text is requested only when `text` is supplied. `max_characters` must be a
strict positive signed 32-bit integer. The server default is 5,000 characters
per result, applied after format conversion. Both formats return content in
`SearchResult.text`, which is `None` when absent or when extraction fails.
`model_fields_set` distinguishes those cases. Full text is returned alongside
snippets.

Highlights are optional and disabled by default. Set
`content=ContentOptions(highlights=True)` to return concise, query-relevant
excerpts in addition to snippets. `SearchResult.highlights` is a `list[str]`, or
`None` when the field is absent. Highlights can coexist with snippets and full text.

For token-efficient workflows, your agent can prioritize highlights when building
model context and supplement them with snippets when additional context is needed.
When the API returns both fields, token savings depend on which content your
agent passes to the model.

`summary` and the snippet toggle have been removed from `ContentOptions`.
`favicon` remains optional under `content`. Obsolete answer, usage, news/video,
query tuning, and raw content/summary response fields and models have been removed.
Unknown response fields continue to be retained by Pydantic for forward compatibility.
