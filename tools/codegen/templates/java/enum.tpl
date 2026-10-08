package ai.ateve.models;

import com.fasterxml.jackson.annotation.JsonValue;

/** {{description}} */
public enum {{name}} {
{{values}};

    private final String value;

    {{name}}(String value) { this.value = value; }

    @JsonValue
    public String value() { return value; }
}
