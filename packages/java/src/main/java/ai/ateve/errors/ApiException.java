package ai.ateve.errors;

/**
 * The server answered with a non-2xx status. Carries the parsed error body
 * ({@code {id, error:{code,message,param,type,doc_url}}}).
 */
public class ApiException extends AteveException {

    private final int statusCode;
    private final String requestId;
    private final String code;
    private final String param;
    private final String type;
    private final String docUrl;

    public ApiException(int statusCode, String requestId, String code, String param,
                        String type, String docUrl, String message) {
        super(message);
        this.statusCode = statusCode;
        this.requestId = requestId;
        this.code = code;
        this.param = param;
        this.type = type;
        this.docUrl = docUrl;
    }

    public int statusCode() { return statusCode; }
    /** Response body {@code id}; include when reporting issues. */
    public String requestId() { return requestId; }
    /** Machine-readable error code, e.g. {@code invalid_date_range}. */
    public String code() { return code; }
    /** Offending parameter name, if applicable. */
    public String param() { return param; }
    /** Error family: invalid_request_error | authentication_error | rate_limit_error | server_error. */
    public String type() { return type; }
    public String docUrl() { return docUrl; }

    /**
     * True for 429 / 5xx responses that a caller-owned retry policy may
     * consider. This is metadata only; the SDK never retries automatically.
     */
    public boolean isRetryable() {
        return statusCode == 429 || statusCode >= 500;
    }
}
