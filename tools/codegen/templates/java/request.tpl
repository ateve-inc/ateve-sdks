package ai.ateve.models;

{{imports}}

/** {{description}} */
public final class {{name}} {
{{constants}}
{{fields}}

    private {{name}}(Builder b) {
{{assignments}}
    }

    public static Builder builder() { return new Builder(); }

{{accessors}}

    public static final class Builder {
{{builderFields}}

{{setters}}

{{builderHook}}
    }
}
