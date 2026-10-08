package ai.ateve.errors;

/**
 * The server returned a successful HTTP status but the response body could not
 * be decoded as the documented Ateve response shape.
 *
 * <p>The request definitely reached an HTTP server and may already have been
 * executed and billed. This exception is therefore distinct from a local
 * validation error and carries the response status and request ID for support.
 */
public class ApiResponseException extends AteveException {

    private final int statusCode;
    private final String requestId;
    private final String baseUrl;

    /**
     * @param message human-readable parse failure
     * @param statusCode received HTTP status
     * @param requestId {@code X-Request-Id}, when supplied by the server
     * @param baseUrl endpoint root used by the request
     * @param cause original decoding failure
     */
    public ApiResponseException(String message, int statusCode, String requestId,
                                String baseUrl, Throwable cause) {
        super(message, cause);
        this.statusCode = statusCode;
        this.requestId = requestId;
        this.baseUrl = baseUrl;
    }

    public int statusCode() {
        return statusCode;
    }

    public String requestId() {
        return requestId;
    }

    public String baseUrl() {
        return baseUrl;
    }

    /**
     * @return always true because an HTTP response was already received
     */
    public boolean requestMayHaveBeenSent() {
        return true;
    }
}
