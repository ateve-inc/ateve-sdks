package ai.ateve.models;

/** A citation span inside {@link AnswerBlock#content()} ([startIndex, endIndex)). */
public final class Citation {

    private String url;
    private String title;
    private Integer startIndex;
    private Integer endIndex;
    private String quote;

    private Citation() {
    }

    public String url() { return url; }
    public String title() { return title; }
    public Integer startIndex() { return startIndex; }
    public Integer endIndex() { return endIndex; }
    public String quote() { return quote; }
}
