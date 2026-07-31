package ai.ateve.models;

/** Per-stage credit breakdown. */
public final class UsageBreakdown {

    private Integer search;
    private Integer rerank;
    private Integer answer;

    private UsageBreakdown() {
    }

    public Integer search() { return search; }
    public Integer rerank() { return rerank; }
    public Integer answer() { return answer; }
}
