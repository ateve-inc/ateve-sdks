package ai.ateve.models;

import ai.ateve.internal.InstantMillis;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

/** A single organic / news result. */
public final class SearchResult {

    private String id;
    private String title;
    private String url;
    private String displayUrl;
    private String siteName;
    private String language;
    /** Always present on the wire ({@code yyyy-MM-dd'T'HH:mm:ss.SSS'Z'}); null when unknown. */
    @JsonSerialize(using = InstantMillis.Serializer.class)
    @JsonDeserialize(using = InstantMillis.Deserializer.class)
    private Instant publishedAt;
    private Double score;
    private String snippet;
    private String rawContent;
    private String summary;
    private List<String> highlights;
    private String favicon;
    /** Always present on the wire; may be an empty list. */
    private List<ImageItem> images;
    /** Always present on the wire; null when undetermined. */
    private Boolean isSafe;

    private SearchResult() {
    }

    public String id() { return id; }
    public String title() { return title; }
    public String url() { return url; }
    public String displayUrl() { return displayUrl; }
    public String siteName() { return siteName; }
    public String language() { return language; }
    public Instant publishedAt() { return publishedAt; }
    public Double score() { return score; }
    public String snippet() { return snippet; }
    public String rawContent() { return rawContent; }
    public String summary() { return summary; }
    public List<String> highlights() {
        return highlights == null ? null : Collections.unmodifiableList(highlights);
    }
    public String favicon() { return favicon; }
    public List<ImageItem> images() {
        return images == null ? null : Collections.unmodifiableList(images);
    }
    public Boolean isSafe() { return isSafe; }
}
