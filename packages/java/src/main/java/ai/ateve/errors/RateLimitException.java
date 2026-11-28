package ai.ateve.errors;

/**
 * 429 — rate_limit_exceeded. Carries {@code Retry-After} (seconds) and
 * {@code X-Ateve-Limit-Scope} (qps|qpm|qpd) response headers.
 */
public class RateLimitException extends ApiException {

    private final String limitScope;

    public RateLimitException(int statusCode, String requestId, String code, String param,
                              String type, String docUrl, String message,
                              Long retryAfterSeconds, String limitScope) {
        super(statusCode, requestId, code, param, type, docUrl, message, null, retryAfterSeconds);
        this.limitScope = limitScope;
    }

    /** Which limit tripped: qps, qpm or qpd; null when absent. */
    public String limitScope() {
        return limitScope;
    }
}
