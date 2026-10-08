package ai.ateve.internal;

/** Wire shape of error responses: {@code {id, error:{code,message,param,type,doc_url}}}. */
public final class ErrorBody {

    private String id;
    private Payload error;

    private ErrorBody() {
    }

    public String id() { return id; }
    public Payload error() { return error; }

    public static final class Payload {
        private String code;
        private String message;
        private String param;
        private String type;
        private String docUrl;

        private Payload() {
        }

        public String code() { return code; }
        public String message() { return message; }
        public String param() { return param; }
        public String type() { return type; }
        public String docUrl() { return docUrl; }
    }
}
