package ai.ateve.errors;

/** 402, or 403 with insufficient_credit / credit_limit_exceeded / payment_required. */
public class PaymentRequiredException extends ApiException {

    public PaymentRequiredException(int statusCode, String requestId, String code, String param,
                                    String type, String docUrl, String message) {
        super(statusCode, requestId, code, param, type, docUrl, message);
    }
}
