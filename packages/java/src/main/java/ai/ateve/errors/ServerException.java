package ai.ateve.errors;

import java.util.Map;

/** 5xx — server_error / timeout / service_unavailable. */
public class ServerException extends ApiException {

    public ServerException(int statusCode, String requestId, String code, String param,
                           String type, String docUrl, String message) {
        super(statusCode, requestId, code, param, type, docUrl, message);
    }

    public ServerException(int statusCode, String requestId, String code, String param,
                           String type, String docUrl, String message,
                           Map<?, ?> details, Long retryAfterSeconds) {
        super(statusCode, requestId, code, param, type, docUrl, message, details, retryAfterSeconds);
    }
}
