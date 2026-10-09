package ai.ateve;

import ai.ateve.internal.Json;
import ai.ateve.models.SearchResult;
import ai.ateve.models.ImageItem;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

final class ModelCompatibilityTest {
    @Test
    void missingAndNullFieldsRemainNullableAndUnknownFieldsAreIgnored() {
        SearchResult result = read("{\"text\":null,\"published_at\":null,\"future_field\":true}", SearchResult.class);
        assertNull(result.text());
        assertNull(result.publishedAt());
        assertNull(result.images());
        ImageItem image = read("{\"url\":\"https://example.com/image.png\"}", ImageItem.class);
        assertNull(image.width());
        assertNull(image.height());
        assertNull(image.alt());
    }

    @Test
    void dateSerializationAndResponseCollectionsKeepTheirExistingBehavior() {
        SearchResult result = read("{\"published_at\":\"2026-06-12T08:30:00.000Z\",\"images\":[]}", SearchResult.class);
        assertEquals(Instant.parse("2026-06-12T08:30:00Z"), result.publishedAt());
        assertThrows(UnsupportedOperationException.class, () -> result.images().add(null));
        assertTrue(new String(Json.writeBytes(result), StandardCharsets.UTF_8).contains("2026-06-12T08:30:00.000Z"));
    }

    private static <T> T read(String text, Class<T> type) {
        return Json.read(text.getBytes(StandardCharsets.UTF_8), type);
    }
}
