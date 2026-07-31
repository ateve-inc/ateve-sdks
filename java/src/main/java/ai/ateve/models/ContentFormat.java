package ai.ateve.models;

import com.fasterxml.jackson.annotation.JsonValue;

/** Format of {@code raw_content} in results. */
public enum ContentFormat {
    TEXT("text"),
    MARKDOWN("markdown");

    private final String value;

    ContentFormat(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}
