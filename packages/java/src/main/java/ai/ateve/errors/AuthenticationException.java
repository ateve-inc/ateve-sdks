package ai.ateve.errors;

/** 401 — missing_api_key / invalid_api_key; never retried. */
public class AuthenticationException extends ApiException {

    public AuthenticationException(int statusCode, String requestId, String code, String param,
                                   String type, String docUrl, String message) {
        super(statusCode, requestId, code, param, type, docUrl, message);
    }
}
