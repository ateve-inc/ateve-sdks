package ai.ateve.errors;

import java.util.Map;

/** 400/404/405 — request rejected by validation; never retried. */
public class InvalidRequestException extends ApiException {

    public InvalidRequestException(int statusCode, String requestId, String code, String param,
                                   String type, String docUrl, String message) {
        super(statusCode, requestId, code, param, type, docUrl, message);
    }

    public InvalidRequestException(int statusCode, String requestId, String code, String param,
                                   String type, String docUrl, String message,
                                   Map<?, ?> details, Long retryAfterSeconds) {
        super(statusCode, requestId, code, param, type, docUrl, message, details, retryAfterSeconds);
    }
}
