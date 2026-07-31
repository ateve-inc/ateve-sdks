package ai.ateve.models;

/** Video result item. */
public final class VideoItem {

    private String url;
    private String thumbnail;
    private String title;
    private Integer durationSeconds;

    private VideoItem() {
    }

    public String url() { return url; }
    public String thumbnail() { return thumbnail; }
    public String title() { return title; }
    public Integer durationSeconds() { return durationSeconds; }
}
