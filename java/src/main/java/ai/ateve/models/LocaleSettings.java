package ai.ateve.models;

/**
 * Market / language / user-location settings. All fields optional.
 * Immutable; {@code build()} snapshots the builder.
 */
public final class LocaleSettings {

    private final String mkt;          // ISO 3166-1 alpha-2, e.g. "US"
    private final String language;     // ISO 639-1, e.g. "en"
    private final UserLocation userLocation;

    private LocaleSettings(Builder b) {
        this.mkt = b.mkt;
        this.language = b.language;
        this.userLocation = b.userLocation;
    }

    public static Builder builder() {
        return new Builder();
    }

    public String mkt() { return mkt; }
    public String language() { return language; }
    public UserLocation userLocation() { return userLocation; }

    public static final class Builder {
        private String mkt;
        private String language;
        private UserLocation userLocation;

        public Builder mkt(String mkt) { this.mkt = mkt; return this; }
        public Builder language(String language) { this.language = language; return this; }
        public Builder userLocation(UserLocation userLocation) { this.userLocation = userLocation; return this; }

        public LocaleSettings build() {
            if (mkt != null && !mkt.matches("^[A-Z]{2}$")) {
                throw new IllegalArgumentException(
                        "mkt must be an uppercase ISO 3166-1 alpha-2 code");
            }
            if (language != null && !language.matches("^[a-z]{2}$")) {
                throw new IllegalArgumentException(
                        "language must be a lowercase ISO 639-1 code");
            }
            return new LocaleSettings(this);
        }
    }
}
