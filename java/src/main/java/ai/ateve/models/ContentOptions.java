package ai.ateve.models;

/**
 * Content extraction options. All fields optional; server defaults apply when omitted.
 * Immutable; {@code build()} snapshots the builder.
 */
public final class ContentOptions {

    private final Boolean snippet;
    private final Boolean rawContent;
    private final ContentFormat format;
    private final Boolean summary;
    private final Boolean highlights;
    private final Integer images;   // 0..10, server default 3; 0 = no images
    private final Boolean favicon;

    private ContentOptions(Builder b) {
        this.snippet = b.snippet;
        this.rawContent = b.rawContent;
        this.format = b.format;
        this.summary = b.summary;
        this.highlights = b.highlights;
        this.images = b.images;
        this.favicon = b.favicon;
    }

    public static Builder builder() {
        return new Builder();
    }

    public Boolean snippet() { return snippet; }
    public Boolean rawContent() { return rawContent; }
    public ContentFormat format() { return format; }
    public Boolean summary() { return summary; }
    public Boolean highlights() { return highlights; }
    public Integer images() { return images; }
    public Boolean favicon() { return favicon; }

    public static final class Builder {
        private Boolean snippet;
        private Boolean rawContent;
        private ContentFormat format;
        private Boolean summary;
        private Boolean highlights;
        private Integer images;
        private Boolean favicon;

        public Builder snippet(Boolean snippet) { this.snippet = snippet; return this; }
        public Builder rawContent(Boolean rawContent) { this.rawContent = rawContent; return this; }
        public Builder format(ContentFormat format) { this.format = format; return this; }
        public Builder summary(Boolean summary) { this.summary = summary; return this; }
        public Builder highlights(Boolean highlights) { this.highlights = highlights; return this; }
        public Builder images(Integer images) { this.images = images; return this; }
        public Builder favicon(Boolean favicon) { this.favicon = favicon; return this; }

        public ContentOptions build() {
            if (images != null && (images < 0 || images > 10)) {
                throw new IllegalArgumentException("images must be between 0 and 10");
            }
            return new ContentOptions(this);
        }
    }
}
