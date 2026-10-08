package ai.ateve.errors;

/** 400/404/405 — request rejected by validation; never retried. */
public class InvalidRequestException extends ApiException {

    public InvalidRequestException(int statusCode, String requestId, String code, String param,
                                   String type, String docUrl, String message) {
        super(statusCode, requestId, code, param, type, docUrl, message);
    }
}
