package ai.ateve.models;

import java.util.Collections;
import java.util.Map;

/** Echo of the executed query: original text, effective (rewritten) text, auto-tuned knobs. */
public final class QueryInfo {

    private String original;
    private String effective;
    private Map<String, Object> autoTuned;

    private QueryInfo() {
    }

    public String original() { return original; }
    public String effective() { return effective; }
    /** Unmodifiable view; null when the field was absent. */
    public Map<String, Object> autoTuned() {
        return autoTuned == null ? null : Collections.unmodifiableMap(autoTuned);
    }
}
