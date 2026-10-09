# Ateve Java SDK

Official Java client for the Ateve Search API (`POST /v1/search`).

- Coordinates: `ai.ateve:ateve-java` · Package: `ai.ateve` · JDK 11+
- Runtime dependency: jackson-databind only
- Contract source of truth: [`../contract/openapi.json`](../contract/openapi.json) (local SDK compatibility baseline)

The public Java namespace is exclusively `ai.ateve.*`, derived from Ateve's
owned `ateve.ai` domain.

## Install

```xml
<dependency>
    <groupId>ai.ateve</groupId>
    <artifactId>ateve-java</artifactId>
    <version>0.1.0</version>
</dependency>
```

## Quick start

```java
import ai.ateve.AteveClient;
import ai.ateve.models.*;

AteveClient client = AteveClient.builder().build(); // reads ATEVE_API_KEY

SearchResponse response = client.search(SearchRequest.builder()
        .query("quantum computing")
        .dateRange("week")
        .build());

System.out.println(response.id());
```

## Thin client semantics

One `search` / `searchAsync` call sends exactly one HTTP request. The SDK does
not automatically retry, sleep/back off, switch domains, run a watchdog, or
create a scheduler. It maps the protocol contract into Java types and exposes
enough error metadata for the host application to make its own resilience
decisions. The built-in transport also does not follow redirects, avoiding
forwarding the bearer credential to an unexpected endpoint.

This boundary matters for `/v1/search`: after a timeout or connection reset,
the server may already have executed and billed the request. Retry budgets,
idempotency policy, circuit breakers, and endpoint routing therefore belong at
the application or infrastructure layer, where they can be coordinated across
all outbound calls.

`ApiException.isRetryable()` identifies 429 and 5xx responses as candidates
for a caller-owned retry policy. `RateLimitException` additionally exposes
`retryAfterSeconds()` and `limitScope()`. These are hints; the SDK itself does
not perform the retry.

## High concurrency and host resources

Create and share one `AteveClient` per application or configuration. The client
is immutable and thread-safe, and its JDK `HttpClient` reuses connections.
Clients with default transport settings also share one process-wide
`HttpClient`, so constructing clients for different API keys does not create a
new connection pool and worker set each time.

```java
AteveClient client = AteveClient.builder()
        .maxConcurrentRequests(64)       // optional fail-fast bulkhead; no SDK queue
        .timeout(Duration.ofSeconds(10)) // timeout for the one HTTP request
        .maxResponseBytes(16 * 1024 * 1024L)
        .build();

CompletableFuture<SearchResponse> future =
        client.searchAsync(SearchRequest.builder()
                .query("quantum computing")
                .build());
```

Under load, prefer `searchAsync`. The blocking `search` method is a small
wrapper over it and occupies one caller thread until completion. Response
deserialization and non-async dependent stages may execute on HttpClient
completion threads; use `thenApplyAsync` for expensive downstream work.

For applications that already manage transport resources, inject a shared
`HttpClient`:

```java
HttpClient sharedTransport = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .executor(outboundIoPool)
        .build();

AteveClient client = AteveClient.builder()
        .httpClient(sharedTransport)
        .build();
```

Alternatively, `executor(outboundIoPool)` asks the SDK to create one
client-specific `HttpClient` backed by that executor. In both cases the
transport/executor is borrowed: the SDK never closes or shuts it down. Do not
use a short-lived per-request executor or a latency-sensitive event-loop pool.

The optional bulkhead rejects excess calls before request serialization and
does not create a queue. Cancelling the caller-facing future does not release a
slot early: the slot remains occupied until the underlying exchange actually
finishes, so the configured in-flight bound remains truthful.

## Error handling

```java
try {
    client.search(request);
} catch (RateLimitException e) {
    // e.retryAfterSeconds(), e.limitScope(); caller decides whether to retry
} catch (PaymentRequiredException e) {
    // billing: 402, or 403 with a billing-specific error code
} catch (AuthenticationException e) {
    // bad or missing API key
} catch (InvalidRequestException e) {
    // e.code(), e.param(); includes non-billing 403 permission_denied
} catch (ServerException e) {
    // 5xx response; requestId/code are preserved when the server returned them
} catch (ApiConnectionException e) {
    if (!e.requestMayHaveBeenSent()) {
        // DNS/TCP connect/connect-timeout/TLS handshake: request was not sent
    } else {
        // timeout/reset/body-limit/unknown: retry may duplicate work or billing
    }
} catch (ApiResponseException e) {
    // HTTP success status, but the response violated the documented schema;
    // e.requestMayHaveBeenSent() is always true
} catch (ConcurrencyLimitException e) {
    // rejected locally before network I/O
}
```

All parsed API errors expose `requestId()`. Include it when contacting support.
`ApiConnectionException.requestMayHaveBeenSent()` is deliberately conservative:
`false` is a safe transport fact, while `true` means the host must assume the
server may already have executed the search. In particular,
`HttpConnectTimeoutException` is classified as not sent even though it extends
`HttpTimeoutException`; an ordinary response timeout and a response-body-limit
failure are classified as possibly sent.

## Configuration

| Builder                      | Default                                           | Notes                                                  |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `apiKey(String)`             | env `ATEVE_API_KEY`                               | required                                               |
| `baseUrl(String)`            | env `ATEVE_BASE_URL`, then `https://api.ateve.ai` | one endpoint; no SDK failover                          |
| `timeout(Duration)`          | 60s                                               | timeout for the single request                         |
| `connectTimeout(Duration)`   | 5s                                                | ignored when `httpClient` is supplied                  |
| `maxResponseBytes(long)`     | 32 MiB                                            | hard per-response buffer cap; `0` = unlimited          |
| `executor(Executor)`         | shared default transport                          | creates one client transport using a borrowed executor |
| `maxConcurrentRequests(int)` | `0` = unlimited                                   | optional fail-fast bulkhead; no queue                  |
| `httpClient(HttpClient)`     | process-wide shared JDK client                    | caller-owned transport used as-is                      |

## Build & test

```bash
mvn test              # local JDK HttpServer tests; no external network
mvn -Prelease verify  # also builds sources.jar and javadoc.jar
```

## Search contract limits

Use `SearchRequest.builder().maxResults(...)` (1–100, default 10); `limit`
and `offset` have been removed. `ContentOptions.snippet` is optional and
its builder defaults to `true`. To retrieve full text, pass
`content(ContentOptions.builder().text(TextOptions.builder().build()).build())`,
or configure `TextOptions.builder().maxCharacters(8000).format(ContentFormat.MARKDOWN).build()`.
`format` accepts `ContentFormat.TEXT` (default) or `ContentFormat.MARKDOWN`.
Omitting `text` does not request full text. `maxCharacters` remains a positive
signed 32-bit integer; its server default is 5000 per result, applied after
format conversion. `summary` and `highlights` have been removed from
`ContentOptions`; `favicon` remains optional under `content`.

Both formats return content through `SearchResult.text()`, which is `null`
when absent or extraction fails. Snippets may coexist with text; use
`ContentOptions.builder().snippet(false)` to omit them. Obsolete answer, usage,
news/video, query tuning and raw content/summary/highlights response fields
and models have been removed.
