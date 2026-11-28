package ai.ateve.internal;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Immutable snapshots of JSON containers, including entries with explicit null values. */
public final class JsonValues {
    private JsonValues() {}

    public static Map<String, Object> copyMap(Map<?, ?> value) {
        if (value == null) return null;
        Map<String, Object> result = new LinkedHashMap<>();
        value.forEach((key, item) -> {
            if (!(key instanceof String)) {
                throw new IllegalArgumentException("JSON object keys must be strings");
            }
            result.put((String) key, copyValue(item));
        });
        return Collections.unmodifiableMap(result);
    }

    public static List<Object> copyList(List<?> value) {
        if (value == null) return null;
        List<Object> result = new ArrayList<>(value.size());
        value.forEach(item -> result.add(copyValue(item)));
        return Collections.unmodifiableList(result);
    }

    public static Object copyContent(Object value) {
        if (value instanceof List<?>) return copyList((List<?>) value);
        if (value instanceof Map<?, ?>) return copyMap((Map<?, ?>) value);
        if (value == null || value instanceof String) return value;
        throw new IllegalArgumentException("Expected text, a JSON object, or a JSON array");
    }

    private static Object copyValue(Object value) {
        if (value instanceof Number || value instanceof Boolean) return value;
        return copyContent(value);
    }
}
