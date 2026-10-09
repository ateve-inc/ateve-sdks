package ai.ateve;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Golden wire fixtures, shared with the contract package. */
final class Fixtures {

    private Fixtures() {
    }

    static final String GOLDEN_RESPONSE = load("golden-response-java.json");

    static final String ERROR_401 = load("error-401.json");

    static final String ERROR_429 = load("error-429.json");

    static final String ERROR_400 = load("error-400.json");

    static String liveResponse(String scenario) {
        return load("live-" + scenario + "-response.json");
    }
    private static String load(String name) {
        try (InputStream stream = Fixtures.class.getResourceAsStream("/" + name)) {
            if (stream == null) throw new IllegalStateException("Missing fixture: " + name);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Cannot read fixture: " + name, error);
        }
    }
}
