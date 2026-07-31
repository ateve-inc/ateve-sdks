package ai.ateve.errors;

/**
 * Rejected locally by the client-side bulkhead ({@code maxConcurrentRequests})
 * — the request was never sent. Distinct from {@link RateLimitException}
 * (server-side 429): callers may shed load, queue, or retry shortly.
 */
public class ConcurrencyLimitException extends AteveException {

    private final int maxConcurrentRequests;

    public ConcurrencyLimitException(String message, int maxConcurrentRequests) {
        super(message);
        this.maxConcurrentRequests = maxConcurrentRequests;
    }

    /** The configured bulkhead size that was exceeded. */
    public int maxConcurrentRequests() {
        return maxConcurrentRequests;
    }
}
