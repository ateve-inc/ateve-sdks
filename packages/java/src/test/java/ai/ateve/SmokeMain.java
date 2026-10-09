package ai.ateve;

import ai.ateve.errors.RateLimitException;
import ai.ateve.models.SearchRequest;
import ai.ateve.models.SearchResponse;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Dependency-free smoke runner for environments without JUnit. */
public final class SmokeMain {

    private static int passed;

    public static void main(String[] args) throws Exception {
        requestAndResponseContract();
        noAutomaticRetry();
        concurrentAsyncCalls();
        bulkheadRejectsExcess();
        System.out.println("SMOKE OK: " + passed + " checks passed");
    }

    private static void requestAndResponseContract() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            SearchResponse response = client(api).search(request());
            check("response id", "srch_01J9ZK3V6XQ8".equals(response.id()));
            check("snake_case response", response.latencyMs() == 412);
            check("authorization header",
                    "Bearer sk_test_123".equals(api.receivedAuthHeaders.get(0)));
            check("user agent", ("ateve-java/" + AteveClient.VERSION).equals(api.receivedUserAgents.get(0)));
        }
    }

    private static void noAutomaticRetry() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(429, Fixtures.ERROR_429, Map.of("Retry-After", "3"));
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            try {
                client(api).search(request());
                check("429 throws", false);
            } catch (RateLimitException error) {
                check("retry hint exposed", Long.valueOf(3).equals(error.retryAfterSeconds()));
                check("one SDK call is one request", api.hits() == 1);
            }
        }
    }

    private static void concurrentAsyncCalls() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            AteveClient client = client(api);
            List<CompletableFuture<SearchResponse>> futures = new ArrayList<>();
            for (int i = 0; i < 32; i++) {
                futures.add(client.searchAsync(request()));
            }
            for (CompletableFuture<SearchResponse> future : futures) {
                check("async result",
                        "srch_01J9ZK3V6XQ8".equals(future.get(10, TimeUnit.SECONDS).id()));
            }
            check("32 requests reached server", api.hits() == 32);
        }
    }

    private static void bulkheadRejectsExcess() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueueDelayed(200, Fixtures.GOLDEN_RESPONSE, 500);
            AteveClient client = AteveClient.builder()
                    .apiKey("sk_test_123")
                    .baseUrl(api.baseUrl())
                    .maxConcurrentRequests(1)
                    .build();
            CompletableFuture<SearchResponse> first = client.searchAsync(request());
            Thread.sleep(100);
            CompletableFuture<SearchResponse> second = client.searchAsync(request());
            check("bulkhead rejects fast", second.isCompletedExceptionally());
            check("first request completes",
                    "srch_01J9ZK3V6XQ8".equals(first.get(5, TimeUnit.SECONDS).id()));
        }
    }

    private static SearchRequest request() {
        return SearchRequest.builder().query("quantum computing").build();
    }

    private static AteveClient client(MockApi api) {
        return AteveClient.builder()
                .apiKey("sk_test_123")
                .baseUrl(api.baseUrl())
                .timeout(Duration.ofSeconds(5))
                .build();
    }

    private static void check(String name, boolean condition) {
        if (!condition) {
            throw new AssertionError("SMOKE FAIL: " + name);
        }
        passed++;
    }
}
