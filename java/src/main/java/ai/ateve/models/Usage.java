package ai.ateve.models;

/** Credits consumed by this request. */
public final class Usage {

    private Integer credits;
    private UsageBreakdown breakdown;

    private Usage() {
    }

    public Integer credits() { return credits; }
    public UsageBreakdown breakdown() { return breakdown; }
}
