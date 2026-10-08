package ai.ateve.errors;

import javax.net.ssl.SSLHandshakeException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.PortUnreachableException;
import java.net.UnknownHostException;
import java.net.http.HttpConnectTimeoutException;

/**
 * Transport-layer failure: DNS resolution, TCP connect, TLS handshake,
 * request timeout, or response-body limit. The SDK does not retry or switch
 * endpoints; the original cause remains available through {@link #getCause()}.
 */
public class ApiConnectionException extends AteveException {

    private final String baseUrl;
    private final boolean requestMayHaveBeenSent;

    /**
     * Infers transmission status conservatively from the cause chain.
     *
     * @param message human-readable error message
     * @param baseUrl endpoint root used by the request
     * @param cause original transport failure
     */
    public ApiConnectionException(String message, String baseUrl, Throwable cause) {
        this(message, baseUrl, cause, inferRequestMayHaveBeenSent(cause));
    }

    /**
     * Creates a transport error with an explicit transmission status. This is
     * useful when the caller knows whether dispatch began independently of the
     * exception type.
     *
     * @param message human-readable error message
     * @param baseUrl endpoint root used by the request
     * @param cause original transport failure
     * @param requestMayHaveBeenSent whether request bytes may have reached the server
     */
    public ApiConnectionException(String message, String baseUrl, Throwable cause,
                                  boolean requestMayHaveBeenSent) {
        super(message, cause);
        this.baseUrl = baseUrl;
        this.requestMayHaveBeenSent = requestMayHaveBeenSent;
    }

    /**
     * @return base URL to which the request was sent or was being dispatched
     */
    public String baseUrl() {
        return baseUrl;
    }

    /**
     * Whether request bytes may have reached the server.
     *
     * <p>{@code false} is returned only for failures known to happen before
     * request transmission: DNS resolution, TCP connect, connect timeout, or
     * TLS handshake. {@code true} is conservative and includes response
     * timeout, connection reset, response-body limit, and unknown transport
     * failures. A {@code true} value therefore means retrying may duplicate
     * execution or billing; it does not prove that the server executed the
     * request.
     *
     * @return false only when the request is known not to have been sent
     */
    public boolean requestMayHaveBeenSent() {
        return requestMayHaveBeenSent;
    }

    private static boolean inferRequestMayHaveBeenSent(Throwable cause) {
        Throwable current = cause;
        while (current != null) {
            // HttpConnectTimeoutException extends HttpTimeoutException. Check
            // the connect-specific subtype instead of treating every timeout
            // as an ambiguous, possibly-sent request.
            if (current instanceof HttpConnectTimeoutException
                    || current instanceof ConnectException
                    || current instanceof NoRouteToHostException
                    || current instanceof PortUnreachableException
                    || current instanceof UnknownHostException
                    || current instanceof SSLHandshakeException) {
                return false;
            }
            current = current.getCause();
        }
        return true;
    }
}
