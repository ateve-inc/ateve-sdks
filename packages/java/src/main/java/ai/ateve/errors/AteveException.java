package ai.ateve.errors;

/** Base class for all exceptions thrown by the Ateve SDK. */
public class AteveException extends RuntimeException {

    public AteveException(String message) {
        super(message);
    }

    public AteveException(String message, Throwable cause) {
        super(message, cause);
    }
}
