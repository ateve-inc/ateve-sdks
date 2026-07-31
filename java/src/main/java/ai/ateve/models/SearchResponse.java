package ai.ateve.models;

import java.util.Collections;
import java.util.List;

/** Response body of {@code POST /v1/search}. */
public final class SearchResponse {

    private String id;
    private Long created;          // unix seconds
    private Integer latencyMs;
    private QueryInfo query;
    private AnswerBlock answer;
    private List<SearchResult> results;
    private List<SearchResult> news;
    private List<ImageItem> images;
    private List<VideoItem> videos;
    private Long totalEstimatedMatches;
    private Usage usage;

    private SearchResponse() {
    }

    public String id() { return id; }
    public Long created() { return created; }
    public Integer latencyMs() { return latencyMs; }
    public QueryInfo query() { return query; }
    public AnswerBlock answer() { return answer; }
    public List<SearchResult> results() {
        return results == null ? null : Collections.unmodifiableList(results);
    }
    public List<SearchResult> news() {
        return news == null ? null : Collections.unmodifiableList(news);
    }
    public List<ImageItem> images() {
        return images == null ? null : Collections.unmodifiableList(images);
    }
    public List<VideoItem> videos() {
        return videos == null ? null : Collections.unmodifiableList(videos);
    }
    public Long totalEstimatedMatches() { return totalEstimatedMatches; }
    public Usage usage() { return usage; }
}
