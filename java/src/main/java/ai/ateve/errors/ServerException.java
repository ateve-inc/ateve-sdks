package ai.ateve.errors;

/** 5xx — server_error / timeout / service_unavailable. */
public class ServerException extends ApiException {

    public ServerException(int statusCode, String requestId, String code, String param,
                           String type, String docUrl, String message) {
        super(statusCode, requestId, code, param, type, docUrl, message);
    }
}
