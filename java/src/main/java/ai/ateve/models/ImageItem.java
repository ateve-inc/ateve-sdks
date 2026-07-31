package ai.ateve.models;

/** Image attached to a result. width/height/alt may be null. */
public final class ImageItem {

    private String url;
    private Integer width;
    private Integer height;
    private String alt;

    private ImageItem() {
    }

    public String url() { return url; }
    public Integer width() { return width; }
    public Integer height() { return height; }
    public String alt() { return alt; }
}
