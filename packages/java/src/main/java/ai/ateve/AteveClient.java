package ai.ateve;

import ai.ateve.errors.ApiConnectionException;
import ai.ateve.errors.ApiException;
import ai.ateve.errors.ApiResponseException;
import ai.ateve.errors.AteveException;
import ai.ateve.errors.AuthenticationException;
import ai.ateve.errors.ConcurrencyLimitException;
import ai.ateve.errors.InvalidRequestException;
import ai.ateve.errors.PaymentRequiredException;
import ai.ateve.errors.RateLimitException;
import ai.ateve.errors.ServerException;
import ai.ateve.internal.ErrorBody;
import ai.ateve.internal.Json;
import ai.ateve.models.SearchRequest;
import ai.ateve.models.SearchResponse;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.Flow;
import java.util.concurrent.Semaphore;

/**
 * Thread-safe client for {@code POST /v1/search}.
 *
 * <pre>{@code
 * AteveClient client = AteveClient.builder().build(); // reads ATEVE_API_KEY
 * SearchResponse response = client.search(SearchRequest.builder()
 *         .query("quantum computing")
 *         .build());
 * }</pre>
 *
 * <h2>Thin-client contract</h2>
 * Each {@link #search} or {@link #searchAsync} call sends exactly one HTTP
 * request. The SDK does not retry, back off, switch endpoints, create a
 * scheduler, or run a watchdog. Application-level resilience belongs in the
 * host application, where retry budgets and idempotency decisions can be
 * coordinated with the rest of the workload.
 *
 * <h2>Concurrency and resources</h2>
 * Instances are immutable and safe to share. Reuse one client instead of
 * constructing one per request so the underlying {@link HttpClient} can reuse
 * connections. Clients using the default transport settings also share one
 * process-wide HttpClient. If {@link Builder#executor(Executor)} or
 * {@link Builder#httpClient(HttpClient)} is supplied, that resource remains
 * owned by the caller and is never shut down by this SDK.
 *
 * <p>The optional {@link Builder#maxConcurrentRequests(int)} bulkhead rejects
 * excess work before serialization. Its permit is held until the one
 * underlying HTTP exchange completes, even if the returned future is
 * cancelled. This prevents cancellation from making the configured in-flight
 * limit inaccurate.
 */
public final class AteveClient {

    public static final String DEFAULT_BASE_URL = "https://api.ateve.ai";
    public static final String ENV_API_KEY = "ATEVE_API_KEY";
    public static final String ENV_BASE_URL = "ATEVE_BASE_URL";

    /** Default request timeout. */
    public static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(60);

    /** Default TCP connect and TLS handshake timeout. */
    public static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(5);

    /** Default {@link Builder#maxResponseBytes(long)} value: 32 MiB. */
    public static final long DEFAULT_MAX_RESPONSE_BYTES = 32L * 1024 * 1024;

    static final String VERSION = "0.2.0";
    static final String USER_AGENT = "ateve-java/" + VERSION;

    private static final Set<String> BILLING_ERROR_CODES =
            Set.of("insufficient_credit", "credit_limit_exceeded", "payment_required");

    /** Lazy so injecting a custom transport does not instantiate an unused JDK client. */
    private static final class SharedHttpClient {
        private static final HttpClient INSTANCE =
                newHttpClient(DEFAULT_CONNECT_TIMEOUT, null);
    }

    private final String authHeader;
    private final String baseUrl;
    private final URI searchUri;
    private final Duration timeout;
    private final long maxResponseBytes;
    private final int maxConcurrentRequests;
    private final HttpClient http;
    private final Semaphore bulkhead;

    private AteveClient(Builder builder) {
        this.authHeader = "Bearer " + builder.resolveApiKey();
        this.baseUrl = builder.resolveBaseUrl();
        this.searchUri = toSearchUri(baseUrl);
        this.timeout = builder.timeout;
        this.maxResponseBytes = builder.maxResponseBytes;
        this.maxConcurrentRequests = builder.maxConcurrentRequests;
        this.bulkhead = maxConcurrentRequests > 0 ? new Semaphore(maxConcurrentRequests) : null;

        if (builder.httpClient != null) {
            this.http = builder.httpClient;
        } else if (builder.executor == null
                && DEFAULT_CONNECT_TIMEOUT.equals(builder.connectTimeout)) {
            this.http = SharedHttpClient.INSTANCE;
        } else {
            this.http = newHttpClient(builder.connectTimeout, builder.executor);
        }
    }

    public static Builder builder() {
        return new Builder();
    }

    /**
     * Blocking wrapper around {@link #searchAsync(SearchRequest)}.
     *
     * @throws InvalidRequestException   other non-2xx responses below 500,
     *                                   including non-billing 403 errors
     * @throws AuthenticationException   401
     * @throws PaymentRequiredException  402, or 403 with a billing error code
     * @throws RateLimitException        429
     * @throws ServerException           5xx
     * @throws ApiConnectionException    transport failure or request timeout
     * @throws ConcurrencyLimitException client-side bulkhead full; request not sent
     */
    public SearchResponse search(SearchRequest request) {
        CompletableFuture<SearchResponse> future = searchAsync(request);
        try {
            return future.get();
        } catch (ExecutionException e) {
            Throwable cause = unwrap(e);
            if (cause instanceof AteveException) {
                throw (AteveException) cause;
            }
            rethrowIfError(cause);
            if (cause instanceof RuntimeException) {
                throw (RuntimeException) cause;
            }
            throw new AteveException("Request failed", cause);
        } catch (InterruptedException e) {
            // Cancels only the caller-facing future. The transport may still be
            // completing, so its bulkhead permit is released by its own callback.
            future.cancel(false);
            Thread.currentThread().interrupt();
            throw new ApiConnectionException(
                    "Request to " + baseUrl + " was interrupted while awaiting a response",
                    baseUrl,
                    e,
                    true);
        }
    }

    /**
     * Sends exactly one non-blocking HTTP request.
     *
     * <p>Cancelling the returned future does not promise transport abortion.
     * The underlying exchange is allowed to finish and retains its bulkhead
     * permit until then. Non-async dependent stages may run on HttpClient
     * completion threads; use {@code thenApplyAsync} for expensive work.
     */
    public CompletableFuture<SearchResponse> searchAsync(SearchRequest request) {
        Objects.requireNonNull(request, "request");

        if (bulkhead != null && !bulkhead.tryAcquire()) {
            return CompletableFuture.failedFuture(new ConcurrencyLimitException(
                    "Concurrency limit reached (maxConcurrentRequests=" + maxConcurrentRequests
                            + "); request rejected",
                    maxConcurrentRequests));
        }

        final HttpRequest httpRequest;
        try {
            byte[] body = Json.writeBytes(request);
            httpRequest = HttpRequest.newBuilder(searchUri)
                    .timeout(timeout)
                    .header("Authorization", authHeader)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("User-Agent", USER_AGENT)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
        } catch (Throwable error) {
            releasePermit();
            rethrowIfError(error);
            return CompletableFuture.failedFuture(error);
        }

        final CompletableFuture<HttpResponse<byte[]>> exchange;
        try {
            exchange = http.sendAsync(httpRequest, limitedByteArray(maxResponseBytes));
        } catch (Throwable error) {
            releasePermit();
            rethrowIfError(error);
            return CompletableFuture.failedFuture(new ApiConnectionException(
                    "Request to " + baseUrl + " could not be dispatched: " + messageOf(error),
                    baseUrl,
                    error,
                    false));
        }

        CompletableFuture<SearchResponse> result = new CompletableFuture<>();
        exchange.whenComplete((response, error) -> {
            SearchResponse value = null;
            Throwable failure = null;
            try {
                if (error != null) {
                    failure = mapTransportError(error);
                } else if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    try {
                        value = Json.read(response.body(), SearchResponse.class);
                        validateSearchResponse(value);
                    } catch (Error fatal) {
                        failure = fatal;
                    } catch (RuntimeException decodingFailure) {
                        failure = new ApiResponseException(
                                "Response from " + baseUrl
                                        + " could not be decoded as SearchResponse",
                                response.statusCode(),
                                response.headers().firstValue("X-Request-Id").orElse(null),
                                baseUrl,
                                decodingFailure);
                    }
                } else {
                    failure = mapError(response);
                }
            } catch (Throwable t) {
                failure = t;
            }

            // Release before waking callers so an immediately submitted next
            // request can acquire the just-freed bulkhead slot.
            releasePermit();
            if (failure == null) {
                result.complete(value);
            } else {
                result.completeExceptionally(failure);
            }
        });
        return result;
    }

    /**
     * Rejects a syntactically valid JSON value that does not satisfy the
     * stable, always-present portion of the public response contract.
     */
    private static void validateSearchResponse(SearchResponse response) {
        if (response == null
                || response.id() == null
                || response.created() == null
                || response.latencyMs() == null
                || response.query() == null
                || response.query().original() == null
                || response.results() == null) {
            throw new IllegalArgumentException(
                    "SearchResponse is missing one or more required fields");
        }
    }

    private void releasePermit() {
        if (bulkhead != null) {
            bulkhead.release();
        }
    }

    private ApiConnectionException mapTransportError(Throwable error) {
        Throwable cause = unwrap(error);
        BodyLimitExceededException bodyLimit = findCause(cause, BodyLimitExceededException.class);
        if (bodyLimit != null) {
            return new ApiConnectionException(
                    "Response from " + baseUrl + " exceeded maxResponseBytes=" + maxResponseBytes,
                    baseUrl,
                    bodyLimit,
                    true);
        }
        return new ApiConnectionException(
                "Request to " + baseUrl + " failed: " + messageOf(cause),
                baseUrl,
                cause);
    }

    private static HttpClient newHttpClient(Duration connectTimeout, Executor executor) {
        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NEVER);
        if (executor != null) {
            builder.executor(executor);
        }
        return builder.build();
    }

    private static URI toSearchUri(String baseUrl) {
        URI base;
        try {
            base = URI.create(baseUrl);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("baseUrl is not a valid URI: " + baseUrl, e);
        }
        String scheme = base.getScheme();
        if (scheme == null
                || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))
                || base.getHost() == null
                || base.getUserInfo() != null
                || base.getQuery() != null
                || base.getFragment() != null) {
            throw new IllegalArgumentException(
                    "baseUrl must be an absolute http(s) URI without user-info, query, or fragment: "
                            + baseUrl);
        }
        return URI.create(baseUrl + "/v1/search");
    }

    private static Throwable unwrap(Throwable throwable) {
        Throwable current = throwable;
        while ((current instanceof CompletionException || current instanceof ExecutionException)
                && current.getCause() != null) {
            current = current.getCause();
        }
        return current;
    }

    private static String messageOf(Throwable throwable) {
        return throwable.getMessage() != null
                ? throwable.getMessage()
                : throwable.getClass().getSimpleName();
    }

    private static void rethrowIfError(Throwable throwable) {
        if (throwable instanceof Error) {
            throw (Error) throwable;
        }
    }

    private static <T extends Throwable> T findCause(Throwable throwable, Class<T> type) {
        Throwable current = throwable;
        while (current != null) {
            if (type.isInstance(current)) {
                return type.cast(current);
            }
            current = current.getCause();
        }
        return null;
    }

    private static ApiException mapError(HttpResponse<byte[]> response) {
        int status = response.statusCode();
        ErrorBody parsed = Json.tryRead(response.body(), ErrorBody.class);

        String requestId = response.headers().firstValue("X-Request-Id").orElse(null);
        String code = null;
        String param = null;
        String type = null;
        String docUrl = null;
        String message = "HTTP " + status;
        if (parsed != null) {
            if (parsed.id() != null) {
                requestId = parsed.id();
            }
            if (parsed.error() != null) {
                code = parsed.error().code();
                param = parsed.error().param();
                type = parsed.error().type();
                docUrl = parsed.error().docUrl();
                if (parsed.error().message() != null) {
                    message = parsed.error().message();
                }
            }
        }

        switch (status) {
            case 401:
                return new AuthenticationException(
                        status, requestId, code, param, type, docUrl, message);
            case 402:
                return new PaymentRequiredException(
                        status, requestId, code, param, type, docUrl, message);
            case 403:
                if (code != null && BILLING_ERROR_CODES.contains(code)) {
                    return new PaymentRequiredException(
                            status, requestId, code, param, type, docUrl, message);
                }
                return new InvalidRequestException(
                        status, requestId, code, param, type, docUrl, message);
            case 429:
                Long retryAfter = response.headers().firstValue("Retry-After")
                        .map(AteveClient::parseRetryAfterSeconds)
                        .orElse(null);
                String scope = response.headers().firstValue("X-Ateve-Limit-Scope").orElse(null);
                return new RateLimitException(
                        status, requestId, code, param, type, docUrl, message, retryAfter, scope);
            default:
                if (status >= 500) {
                    return new ServerException(
                            status, requestId, code, param, type, docUrl, message);
                }
                return new InvalidRequestException(
                        status, requestId, code, param, type, docUrl, message);
        }
    }

    /** Parses {@code Retry-After} in both delta-seconds and HTTP-date form. */
    private static Long parseRetryAfterSeconds(String value) {
        String trimmed = value.trim();
        try {
            return Math.max(0L, Long.parseLong(trimmed));
        } catch (NumberFormatException ignored) {
            // Try the HTTP-date representation below.
        }
        try {
            Instant when = ZonedDateTime.parse(trimmed, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
            return Math.max(0L, Duration.between(Instant.now(), when).getSeconds());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    // ------------------------------------------------------------- body cap

    private static final class BodyLimitExceededException extends IOException {
        BodyLimitExceededException(long limit) {
            super("response body exceeded " + limit + " bytes");
        }
    }

    private static HttpResponse.BodyHandler<byte[]> limitedByteArray(long maxBytes) {
        if (maxBytes <= 0) {
            return HttpResponse.BodyHandlers.ofByteArray();
        }
        return responseInfo -> new LimitedByteArraySubscriber(
                maxBytes,
                responseInfo.headers().firstValueAsLong("Content-Length").orElse(-1L));
    }

    /** Buffers at most {@code maxBytes}, then cancels the body subscription. */
    private static final class LimitedByteArraySubscriber
            implements HttpResponse.BodySubscriber<byte[]> {

        private final HttpResponse.BodySubscriber<byte[]> delegate =
                HttpResponse.BodySubscribers.ofByteArray();
        private final CompletableFuture<byte[]> body = new CompletableFuture<>();
        private final long maxBytes;
        private final long declaredLength;
        private Flow.Subscription subscription;
        private long received;

        LimitedByteArraySubscriber(long maxBytes, long declaredLength) {
            this.maxBytes = maxBytes;
            this.declaredLength = declaredLength;
            delegate.getBody().whenComplete((bytes, error) -> {
                if (error != null) {
                    body.completeExceptionally(error);
                } else {
                    body.complete(bytes);
                }
            });
        }

        @Override
        public CompletionStage<byte[]> getBody() {
            return body;
        }

        @Override
        public void onSubscribe(Flow.Subscription newSubscription) {
            this.subscription = newSubscription;
            if (declaredLength > maxBytes) {
                body.completeExceptionally(new BodyLimitExceededException(maxBytes));
                newSubscription.cancel();
                return;
            }
            delegate.onSubscribe(newSubscription);
        }

        @Override
        public void onNext(List<ByteBuffer> item) {
            for (ByteBuffer buffer : item) {
                int remaining = buffer.remaining();
                if (remaining > maxBytes - received) {
                    body.completeExceptionally(new BodyLimitExceededException(maxBytes));
                    subscription.cancel();
                    return;
                }
                received += remaining;
            }
            delegate.onNext(item);
        }

        @Override
        public void onError(Throwable throwable) {
            delegate.onError(throwable);
        }

        @Override
        public void onComplete() {
            delegate.onComplete();
        }
    }

    // --------------------------------------------------------------- builder

    public static final class Builder {

        private String apiKey;
        private String baseUrl;
        private Duration timeout = DEFAULT_TIMEOUT;
        private Duration connectTimeout = DEFAULT_CONNECT_TIMEOUT;
        private long maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES;
        private HttpClient httpClient;
        private Executor executor;
        private int maxConcurrentRequests;

        private Builder() {
        }

        /** Defaults to environment variable {@code ATEVE_API_KEY}. */
        public Builder apiKey(String apiKey) {
            this.apiKey = requireHeaderValue(apiKey, "apiKey");
            return this;
        }

        /** API endpoint root. Defaults to {@code https://api.ateve.ai}. */
        public Builder baseUrl(String baseUrl) {
            this.baseUrl = stripTrailingSlashes(requireText(baseUrl, "baseUrl"));
            return this;
        }

        /** Timeout for the single HTTP request. Default: 60 seconds. */
        public Builder timeout(Duration timeout) {
            this.timeout = requirePositive(timeout, "timeout");
            return this;
        }

        /**
         * TCP connect and TLS handshake timeout. Default: 5 seconds. Ignored
         * when a custom {@link #httpClient(HttpClient)} is supplied.
         */
        public Builder connectTimeout(Duration connectTimeout) {
            this.connectTimeout = requirePositive(connectTimeout, "connectTimeout");
            return this;
        }

        /**
         * Hard cap on one response body. Default: 32 MiB; zero means unlimited.
         */
        public Builder maxResponseBytes(long maxResponseBytes) {
            if (maxResponseBytes < 0) {
                throw new IllegalArgumentException("maxResponseBytes must be >= 0");
            }
            this.maxResponseBytes = maxResponseBytes;
            return this;
        }

        /**
         * Executor used by a client-specific JDK HttpClient. The executor is
         * borrowed: the SDK never shuts it down. Ignored when
         * {@link #httpClient(HttpClient)} is supplied.
         */
        public Builder executor(Executor executor) {
            this.executor = Objects.requireNonNull(executor, "executor");
            return this;
        }

        /**
         * Optional client-side bulkhead. A value of zero (default) is
         * unlimited; excess calls fail before serialization or network I/O.
         */
        public Builder maxConcurrentRequests(int maxConcurrentRequests) {
            if (maxConcurrentRequests < 0) {
                throw new IllegalArgumentException("maxConcurrentRequests must be >= 0");
            }
            this.maxConcurrentRequests = maxConcurrentRequests;
            return this;
        }

        /**
         * Bring a shared, caller-owned HttpClient for proxy, TLS, executor, or
         * cross-library connection-pool control. It is used as-is and is not
         * closed or otherwise managed by this SDK.
         */
        public Builder httpClient(HttpClient httpClient) {
            this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
            return this;
        }

        public AteveClient build() {
            return new AteveClient(this);
        }

        private String resolveApiKey() {
            String key = apiKey != null ? apiKey : System.getenv(ENV_API_KEY);
            if (key == null || key.trim().isEmpty()) {
                throw new AteveException(
                        "API key missing: pass Builder.apiKey(...) or set " + ENV_API_KEY);
            }
            return requireHeaderValue(key, "API key").trim();
        }

        private String resolveBaseUrl() {
            if (baseUrl != null) {
                return baseUrl;
            }
            String environment = System.getenv(ENV_BASE_URL);
            return environment == null || environment.trim().isEmpty()
                    ? DEFAULT_BASE_URL
                    : stripTrailingSlashes(environment.trim());
        }

        private static String requireText(String value, String name) {
            if (value == null || value.trim().isEmpty()) {
                throw new IllegalArgumentException(name + " must not be blank");
            }
            return value.trim();
        }

        private static Duration requirePositive(Duration value, String name) {
            Objects.requireNonNull(value, name);
            if (value.isZero() || value.isNegative()) {
                throw new IllegalArgumentException(name + " must be positive");
            }
            return value;
        }

        private static String requireHeaderValue(String value, String name) {
            String checked = requireText(value, name);
            for (int i = 0; i < checked.length(); i++) {
                char c = checked.charAt(i);
                if (c == '\r' || c == '\n' || c == 0) {
                    throw new IllegalArgumentException(
                            name + " must not contain CR, LF, or NUL characters");
                }
            }
            return checked;
        }

        private static String stripTrailingSlashes(String url) {
            int end = url.length();
            while (end > 0 && url.charAt(end - 1) == '/') {
                end--;
            }
            return url.substring(0, end);
        }
    }
}
