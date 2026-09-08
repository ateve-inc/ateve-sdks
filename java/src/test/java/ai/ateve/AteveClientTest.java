package ai.ateve;

import ai.ateve.errors.ApiConnectionException;
import ai.ateve.errors.ApiResponseException;
import ai.ateve.errors.AuthenticationException;
import ai.ateve.errors.ConcurrencyLimitException;
import ai.ateve.errors.InvalidRequestException;
import ai.ateve.errors.PaymentRequiredException;
import ai.ateve.errors.RateLimitException;
import ai.ateve.errors.ServerException;
import ai.ateve.models.ContentFormat;
import ai.ateve.models.ContentOptions;
import ai.ateve.models.LocaleSettings;
import ai.ateve.models.SearchRequest;
import ai.ateve.models.SearchResponse;
import ai.ateve.models.UserLocation;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AteveClientTest {

    private static SearchRequest minimalRequest() {
        return SearchRequest.builder().query("quantum computing").build();
    }

    private static AteveClient client(MockApi api) {
        return AteveClient.builder()
                .apiKey("sk_test_123")
                .baseUrl(api.baseUrl())
                .timeout(Duration.ofSeconds(5))
                .build();
    }

    @Test
    void publicPackagesUseOwnedAteveAiNamespace() {
        assertEquals("ai.ateve", AteveClient.class.getPackageName());
        assertEquals("ai.ateve.models", SearchRequest.class.getPackageName());
        assertEquals("ai.ateve.errors", AuthenticationException.class.getPackageName());
    }

    @Test
    void goldenResponseDeserializesWithSnakeCaseMapping() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);

            SearchResponse response = client(api).search(minimalRequest());

            assertEquals("srch_01J9ZK3V6XQ8", response.id());
            assertEquals(412, response.latencyMs());
            assertEquals(128000L, response.totalEstimatedMatches());
            assertEquals("climate policy analysis 2026", response.query().effective());
            assertEquals(Boolean.TRUE, response.query().autoTuned().get("freshness_boost"));
            assertEquals(42, response.answer().citations().get(0).endIndex());
            assertEquals("reuters.com/article/abc", response.results().get(0).displayUrl());
            assertEquals(Instant.parse("2026-06-12T08:30:00Z"),
                    response.results().get(0).publishedAt());
            assertEquals(List.of("framework introduces", "carbon pricing"),
                    response.results().get(0).highlights());
            assertEquals(3, response.usage().credits());
        }
    }

    @Test
    void requestSerializesToSnakeCaseAndSendsHeaders() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);

            client(api).search(SearchRequest.builder()
                    .query("climate policy analysis")
                    .limit(20)
                    .dateRange("2026-01-01..2026-06-30")
                    .locale(LocaleSettings.builder().mkt("US").language("en").build())
                    .includeDomains(List.of("reuters.com"))
                    .content(ContentOptions.builder()
                            .summary(true).format(ContentFormat.MARKDOWN).maxCharacters(5000).build())
                    .safeSearch(true)
                    .build());

            String body = api.receivedBodies.get(0);
            assertTrue(body.contains("\"max_characters\":5000"), body);
            assertFalse(body.contains("\"topic\""), body);
            assertFalse(body.contains("\"images\""), body);
            assertTrue(body.contains("\"date_range\":\"2026-01-01..2026-06-30\""), body);
            assertTrue(body.contains("\"include_domains\":[\"reuters.com\"]"), body);
            assertTrue(body.contains("\"safe_search\":true"), body);
            assertFalse(body.contains("dateRange"), "camelCase leaked to wire: " + body);
            assertFalse(body.contains("\"offset\""), "null fields must be omitted: " + body);
            assertEquals("Bearer sk_test_123", api.receivedAuthHeaders.get(0));
            assertEquals("ateve-java/0.1.0", api.receivedUserAgents.get(0));
        }
    }

    @Test
    void eachCallSendsExactlyOneRequestEvenForRetryableStatuses() throws Exception {
        try (MockApi rateLimited = new MockApi(); MockApi failing = new MockApi()) {
            rateLimited.enqueue(429, Fixtures.ERROR_429, Map.of("Retry-After", "0"));
            rateLimited.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            failing.enqueue(503, "{\"error\":{\"code\":\"service_unavailable\"}}");
            failing.enqueue(200, Fixtures.GOLDEN_RESPONSE);

            assertThrows(RateLimitException.class,
                    () -> client(rateLimited).search(minimalRequest()));
            assertThrows(ServerException.class,
                    () -> client(failing).search(minimalRequest()));

            assertEquals(1, rateLimited.hits(), "the SDK must not retry 429");
            assertEquals(1, failing.hits(), "the SDK must not retry 5xx");
        }
    }

    @Test
    void builtInTransportDoesNotFollowRedirectsWithBearerCredential() throws Exception {
        try (MockApi source = new MockApi(); MockApi destination = new MockApi()) {
            source.enqueue(302, "", Map.of("Location", destination.baseUrl() + "/v1/search"));
            destination.enqueue(200, Fixtures.GOLDEN_RESPONSE);

            InvalidRequestException redirect = assertThrows(InvalidRequestException.class,
                    () -> client(source).search(minimalRequest()));

            assertEquals(302, redirect.statusCode());
            assertEquals(1, source.hits());
            assertEquals(0, destination.hits(),
                    "Authorization must not be forwarded to a redirect destination");
        }
    }

    @Test
    void errorMappingsPreserveStructuredMetadata() throws Exception {
        try (MockApi auth = new MockApi(); MockApi invalid = new MockApi()) {
            auth.enqueue(401, Fixtures.ERROR_401);
            invalid.enqueue(400, Fixtures.ERROR_400);

            AuthenticationException authentication = assertThrows(AuthenticationException.class,
                    () -> client(auth).search(minimalRequest()));
            assertEquals("missing_api_key", authentication.code());
            assertEquals("authentication_error", authentication.type());
            assertEquals("req_01J9ZK3V6XQ9", authentication.requestId());

            InvalidRequestException request = assertThrows(InvalidRequestException.class,
                    () -> client(invalid).search(minimalRequest()));
            assertEquals("invalid_date_range", request.code());
            assertEquals("date_range", request.param());
        }
    }

    @Test
    void errorRequestIdFallsBackToResponseHeader() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(502, "<html>bad gateway</html>",
                    Map.of("Content-Type", "text/html", "X-Request-Id", "req_from_header"));

            ServerException error = assertThrows(ServerException.class,
                    () -> client(api).search(minimalRequest()));

            assertEquals("req_from_header", error.requestId());
            assertEquals("HTTP 502", error.getMessage());
        }
    }

    @Test
    void malformedSuccessIsTypedAsPossiblyBilledResponseError() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, "<html>not a search response</html>",
                    Map.of("Content-Type", "text/html", "X-Request-Id", "req_bad_body"));

            ApiResponseException error = assertThrows(ApiResponseException.class,
                    () -> client(api).search(minimalRequest()));

            assertEquals(200, error.statusCode());
            assertEquals("req_bad_body", error.requestId());
            assertEquals(api.baseUrl(), error.baseUrl());
            assertTrue(error.requestMayHaveBeenSent());
            assertFalse(error.getMessage().contains("<html>"),
                    "untrusted response content must not be copied into exception messages");
        }
    }

    @Test
    void structurallyIncompleteSuccessIsTypedAsPossiblyBilledResponseError() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, "{\"id\":\"req_incomplete\"}",
                    Map.of("X-Request-Id", "req_incomplete"));

            ApiResponseException error = assertThrows(ApiResponseException.class,
                    () -> client(api).search(minimalRequest()));

            assertEquals(200, error.statusCode());
            assertEquals("req_incomplete", error.requestId());
            assertTrue(error.requestMayHaveBeenSent());
        }
    }

    @Test
    void responseCollectionsCannotBeMutatedByCallers() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);

            SearchResponse response = client(api).search(minimalRequest());

            assertThrows(UnsupportedOperationException.class,
                    () -> response.results().clear());
            assertThrows(UnsupportedOperationException.class,
                    () -> response.query().autoTuned().put("unexpected", true));
            assertThrows(UnsupportedOperationException.class,
                    () -> response.results().get(0).highlights().add("unexpected"));
        }
    }

    @Test
    void rateLimitSurfacesRetryHintsWithoutRetrying() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(429, Fixtures.ERROR_429,
                    Map.of("Retry-After", "7", "X-Ateve-Limit-Scope", "qpm"));

            RateLimitException error = assertThrows(RateLimitException.class,
                    () -> client(api).search(minimalRequest()));

            assertEquals(7L, error.retryAfterSeconds());
            assertEquals("qpm", error.limitScope());
            assertTrue(error.isRetryable(), "metadata should help a host-owned retry policy");
            assertEquals(1, api.hits());
        }
    }

    @Test
    void rateLimitParsesHttpDateRetryAfter() throws Exception {
        String retryAt = ZonedDateTime.now(ZoneOffset.UTC)
                .plusSeconds(30)
                .format(DateTimeFormatter.RFC_1123_DATE_TIME);
        try (MockApi api = new MockApi()) {
            api.enqueue(429, Fixtures.ERROR_429, Map.of("Retry-After", retryAt));

            RateLimitException error = assertThrows(RateLimitException.class,
                    () -> client(api).search(minimalRequest()));

            assertTrue(error.retryAfterSeconds() != null
                            && error.retryAfterSeconds() >= 0
                            && error.retryAfterSeconds() <= 30,
                    "HTTP-date Retry-After was not parsed: " + error.retryAfterSeconds());
        }
    }

    @Test
    void billingAndPermission403RemainDistinct() throws Exception {
        String billing = "{\"id\":\"req_b1\",\"error\":{\"code\":\"insufficient_credit\","
                + "\"message\":\"Low credit.\",\"type\":\"invalid_request_error\"}}";
        String permission = "{\"id\":\"req_p1\",\"error\":{\"code\":\"permission_denied\","
                + "\"message\":\"No access.\",\"type\":\"invalid_request_error\"}}";
        try (MockApi billingApi = new MockApi(); MockApi permissionApi = new MockApi()) {
            billingApi.enqueue(403, billing);
            permissionApi.enqueue(403, permission);

            assertThrows(PaymentRequiredException.class,
                    () -> client(billingApi).search(minimalRequest()));
            InvalidRequestException error = assertThrows(InvalidRequestException.class,
                    () -> client(permissionApi).search(minimalRequest()));
            assertEquals("permission_denied", error.code());
        }
    }

    @Test
    void asyncCallsShareOneClientAndAllComplete() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            AteveClient client = client(api);
            List<CompletableFuture<SearchResponse>> futures = new ArrayList<>();

            for (int i = 0; i < 64; i++) {
                futures.add(client.searchAsync(minimalRequest()));
            }
            for (CompletableFuture<SearchResponse> future : futures) {
                assertEquals("srch_01J9ZK3V6XQ8", future.get(15, TimeUnit.SECONDS).id());
            }
            assertEquals(64, api.hits());
        }
    }

    @Test
    void defaultConfiguredClientsShareTheProcessTransport() throws Exception {
        AteveClient first = AteveClient.builder().apiKey("one").build();
        AteveClient second = AteveClient.builder().apiKey("two").build();

        assertSame(transport(first), transport(second),
                "default clients should share one HttpClient connection pool and worker set");
    }

    @Test
    void customExecutorIsReusedAndRemainsCallerOwned() throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2);
        AtomicInteger submissions = new AtomicInteger();
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            AteveClient first = AteveClient.builder()
                    .apiKey("one").baseUrl(api.baseUrl())
                    .executor(task -> {
                        submissions.incrementAndGet();
                        workers.execute(task);
                    })
                    .build();
            AteveClient defaultClient = AteveClient.builder().apiKey("two").build();

            first.search(minimalRequest());
            first.search(minimalRequest());

            assertTrue(submissions.get() > 0, "JDK HttpClient should use the supplied executor");
            assertFalse(workers.isShutdown(), "the SDK must not own or stop caller executors");
            assertNotSame(transport(first), transport(defaultClient));
        } finally {
            workers.shutdownNow();
        }
    }

    @Test
    void customConnectTimeoutCreatesConfiguredClientTransport() throws Exception {
        Duration connectTimeout = Duration.ofMillis(1_234);
        AteveClient defaultClient = AteveClient.builder().apiKey("one").build();
        AteveClient configured = AteveClient.builder()
                .apiKey("two")
                .connectTimeout(connectTimeout)
                .build();

        assertNotSame(transport(defaultClient), transport(configured));
        assertEquals(connectTimeout, transport(configured).connectTimeout().orElseThrow());
    }

    @Test
    void callerProvidedHttpClientIsUsedAsIs() throws Exception {
        HttpClient transport = HttpClient.newHttpClient();
        AteveClient client = AteveClient.builder()
                .apiKey("key")
                .httpClient(transport)
                .build();

        assertSame(transport, transport(client));
    }

    @Test
    void sdkCreatesNoNamedSchedulerOrWatchdogThread() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            client(api).search(minimalRequest());

            boolean foundSdkThread = Thread.getAllStackTraces().keySet().stream()
                    .map(Thread::getName)
                    .anyMatch(name -> name.startsWith("ateve-sdk-"));
            assertFalse(foundSdkThread, "thin SDK must not create scheduler/watchdog threads");
        }
    }

    @Test
    void requestTimeoutIsSingleAttemptAndMapsToConnectionError() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueueDelayed(200, Fixtures.GOLDEN_RESPONSE, 1_000);
            AteveClient client = AteveClient.builder()
                    .apiKey("key").baseUrl(api.baseUrl())
                    .timeout(Duration.ofMillis(150))
                    .build();

            ApiConnectionException error = assertThrows(ApiConnectionException.class,
                    () -> client.search(minimalRequest()));

            assertTrue(hasCause(error, HttpTimeoutException.class),
                    "timeout cause should remain inspectable");
            assertTrue(error.requestMayHaveBeenSent(),
                    "a response timeout is ambiguous and may already be billed");
            assertEquals(1, api.hits(), "a timeout must not trigger a hidden retry");
        }
    }

    @Test
    void blockingInterruptionPreservesAmbiguousDeliveryMetadata() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueueDelayed(200, Fixtures.GOLDEN_RESPONSE, 500);
            AteveClient client = AteveClient.builder()
                    .apiKey("key").baseUrl(api.baseUrl())
                    .timeout(Duration.ofSeconds(5))
                    .build();

            Thread.currentThread().interrupt();
            try {
                ApiConnectionException error = assertThrows(ApiConnectionException.class,
                        () -> client.search(minimalRequest()));
                assertTrue(error.requestMayHaveBeenSent());
                assertTrue(Thread.currentThread().isInterrupted());
            } finally {
                Thread.interrupted();
            }
        }
    }

    @Test
    void deadEndpointSurfacesBaseUrlWithoutFailover() throws Exception {
        MockApi dead = new MockApi();
        String deadUrl = dead.baseUrl();
        dead.close();
        AteveClient client = AteveClient.builder()
                .apiKey("key").baseUrl(deadUrl)
                .timeout(Duration.ofSeconds(2))
                .build();

        ApiConnectionException error = assertThrows(ApiConnectionException.class,
                () -> client.search(minimalRequest()));
        assertEquals(deadUrl, error.baseUrl());
        assertFalse(error.requestMayHaveBeenSent(),
                "connection refusal happens before request transmission");
    }

    @Test
    void responseBodyLimitAbortsBuffering() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            AteveClient client = AteveClient.builder()
                    .apiKey("key").baseUrl(api.baseUrl())
                    .maxResponseBytes(64)
                    .build();

            ApiConnectionException error = assertThrows(ApiConnectionException.class,
                    () -> client.search(minimalRequest()));
            assertTrue(error.getMessage().contains("maxResponseBytes=64"), error.getMessage());
            assertTrue(error.requestMayHaveBeenSent(),
                    "the server already produced a response before the body cap failed");
        }
    }

    @Test
    void connectionMetadataHandlesConnectTimeoutInheritanceConservatively() {
        assertFalse(new ApiConnectionException("connect timeout", "https://example.test",
                new HttpConnectTimeoutException("connect timeout")).requestMayHaveBeenSent());
        assertFalse(new ApiConnectionException("dns", "https://example.test",
                new UnknownHostException("unknown")).requestMayHaveBeenSent());
        assertFalse(new ApiConnectionException("connect", "https://example.test",
                new ConnectException("refused")).requestMayHaveBeenSent());
        assertTrue(new ApiConnectionException("response timeout", "https://example.test",
                new HttpTimeoutException("response timeout")).requestMayHaveBeenSent());
    }

    @Test
    void synchronousDispatchFailuresReleasePermitAndPreserveErrors() throws Exception {
        AssertionError fatal = new AssertionError("fatal dispatch failure");
        AteveClient fatalClient = AteveClient.builder()
                .apiKey("key")
                .httpClient(new ThrowingHttpClient(fatal))
                .maxConcurrentRequests(1)
                .build();

        assertSame(fatal, assertThrows(AssertionError.class,
                () -> fatalClient.searchAsync(minimalRequest())));
        assertSame(fatal, assertThrows(AssertionError.class,
                () -> fatalClient.searchAsync(minimalRequest())),
                "the first Error must not leak the only permit");

        IllegalStateException dispatchFailure = new IllegalStateException("executor rejected");
        AteveClient rejectedClient = AteveClient.builder()
                .apiKey("key")
                .httpClient(new ThrowingHttpClient(dispatchFailure))
                .maxConcurrentRequests(1)
                .build();

        for (int i = 0; i < 2; i++) {
            ExecutionException failed = assertThrows(ExecutionException.class,
                    () -> rejectedClient.searchAsync(minimalRequest()).get());
            assertTrue(failed.getCause() instanceof ApiConnectionException);
            ApiConnectionException connection = (ApiConnectionException) failed.getCause();
            assertFalse(connection.requestMayHaveBeenSent());
            assertSame(dispatchFailure, connection.getCause());
        }
    }

    @Test
    void bulkheadRejectsExcessThenRecovers() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueueDelayed(200, Fixtures.GOLDEN_RESPONSE, 600);
            AteveClient client = AteveClient.builder()
                    .apiKey("key").baseUrl(api.baseUrl())
                    .maxConcurrentRequests(1)
                    .timeout(Duration.ofSeconds(5))
                    .build();

            CompletableFuture<SearchResponse> first = client.searchAsync(minimalRequest());
            awaitHits(api, 1);
            CompletableFuture<SearchResponse> rejected = client.searchAsync(minimalRequest());

            ExecutionException error = assertThrows(ExecutionException.class, rejected::get);
            assertTrue(error.getCause() instanceof ConcurrencyLimitException);
            assertEquals("srch_01J9ZK3V6XQ8", first.get(5, TimeUnit.SECONDS).id());
            assertEquals("srch_01J9ZK3V6XQ8",
                    client.searchAsync(minimalRequest()).get(5, TimeUnit.SECONDS).id());
        }
    }

    @Test
    void cancellationDoesNotReleaseBulkheadBeforeTransportCompletes() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueueDelayed(200, Fixtures.GOLDEN_RESPONSE, 600);
            AteveClient client = AteveClient.builder()
                    .apiKey("key").baseUrl(api.baseUrl())
                    .maxConcurrentRequests(1)
                    .timeout(Duration.ofSeconds(5))
                    .build();

            CompletableFuture<SearchResponse> first = client.searchAsync(minimalRequest());
            awaitHits(api, 1);
            first.cancel(true);

            ExecutionException rejected = assertThrows(ExecutionException.class,
                    () -> client.searchAsync(minimalRequest()).get());
            assertTrue(rejected.getCause() instanceof ConcurrencyLimitException,
                    "caller cancellation must not undercount in-flight transport");

            Thread.sleep(800);
            assertEquals("srch_01J9ZK3V6XQ8",
                    client.searchAsync(minimalRequest()).get(5, TimeUnit.SECONDS).id());
        }
    }

    @Test
    void parseFailureReleasesBulkheadPermit() throws Exception {
        try (MockApi api = new MockApi()) {
            api.enqueue(200, "not json");
            api.enqueue(200, Fixtures.GOLDEN_RESPONSE);
            AteveClient client = AteveClient.builder()
                    .apiKey("key").baseUrl(api.baseUrl())
                    .maxConcurrentRequests(1)
                    .build();

            assertThrows(ai.ateve.errors.AteveException.class,
                    () -> client.search(minimalRequest()));
            assertEquals("srch_01J9ZK3V6XQ8", client.search(minimalRequest()).id());
        }
    }

    @Test
    void builderValidatesResourceAndEndpointSettings() {
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().timeout(Duration.ZERO));
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().connectTimeout(Duration.ofSeconds(-1)));
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().maxConcurrentRequests(-1));
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().maxResponseBytes(-1));
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().apiKey("key").baseUrl("not-a-url").build());
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().apiKey("key")
                        .baseUrl("https://api.ateve.ai?tenant=x").build());
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().apiKey("key")
                        .baseUrl("https://user:password@api.ateve.ai").build());
        assertThrows(IllegalArgumentException.class,
                () -> AteveClient.builder().apiKey("key\r\nX-Evil: injected"));
    }

    @Test
    void modelBuildersSnapshotCallerState() {
        SearchRequest.Builder builder = SearchRequest.builder().query("first");
        SearchRequest first = builder.build();
        builder.query("second").limit(5);
        SearchRequest second = builder.build();

        assertEquals("first", first.query());
        assertNull(first.limit());
        assertEquals("second", second.query());
        assertEquals(5, second.limit());

        List<String> domains = new ArrayList<>(List.of("reuters.com"));
        SearchRequest copied = SearchRequest.builder()
                .query("q").includeDomains(domains).build();
        domains.add("evil.example");
        assertEquals(List.of("reuters.com"), copied.includeDomains());
    }

    @Test
    void queryIsRequiredAtBuilderLevel() {
        assertThrows(IllegalArgumentException.class,
                () -> SearchRequest.builder().build());
    }

    @Test
    void requestBuildersValidatePublishedContractBeforeNetworkIo() {
        assertThrows(IllegalArgumentException.class,
                () -> SearchRequest.builder().query("x".repeat(2001)).build());
        assertThrows(IllegalArgumentException.class,
                () -> SearchRequest.builder().query("x").limit(0).build());
        assertThrows(IllegalArgumentException.class,
                () -> SearchRequest.builder().query("x").offset(1001).build());
        assertThrows(IllegalArgumentException.class,
                () -> SearchRequest.builder().query("x").dateRange("2026-02-31").build());
        assertThrows(IllegalArgumentException.class,
                () -> SearchRequest.builder().query("x")
                        .dateRange("2026-07-31..2026-01-01").build());
        assertThrows(IllegalArgumentException.class,
                () -> ContentOptions.builder().maxCharacters(0).build());
        assertThrows(IllegalArgumentException.class,
                () -> SearchRequest.builder().query("q").offset(100).build());
        assertEquals(99, SearchRequest.builder().query("q").offset(99).build().offset());
        assertThrows(IllegalArgumentException.class,
                () -> LocaleSettings.builder().mkt("us").build());
        assertThrows(IllegalArgumentException.class,
                () -> LocaleSettings.builder().language("EN").build());
        assertThrows(IllegalArgumentException.class,
                () -> UserLocation.builder().country("usa").build());
        assertThrows(IllegalArgumentException.class,
                () -> UserLocation.builder().timezone("PST").build());
    }

    private static HttpClient transport(AteveClient client) throws Exception {
        Field field = AteveClient.class.getDeclaredField("http");
        field.setAccessible(true);
        return (HttpClient) field.get(client);
    }

    private static boolean hasCause(Throwable error, Class<? extends Throwable> type) {
        Throwable current = error;
        while (current != null) {
            if (type.isInstance(current)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static void awaitHits(MockApi api, int expected) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (api.hits() < expected && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertEquals(expected, api.hits(), "request did not reach mock in time");
    }
}
