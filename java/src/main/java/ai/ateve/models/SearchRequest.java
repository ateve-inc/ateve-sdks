package ai.ateve.models;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Request body for {@code POST /v1/search}. Wire format is snake_case
 * (handled globally by the SDK's ObjectMapper).
 *
 * <p>Only {@code query} is required. Server-side limits: query ≤ 2000 chars,
 * limit 1..50 (default 10), offset 0..1000, include/exclude_domains ≤ 300 entries.
 *
 * <p>Instances are immutable and safe to share across threads; {@code build()}
 * snapshots the builder, so reusing or mutating a {@link Builder} afterwards
 * never affects previously built requests.
 */
public final class SearchRequest {

    private static final Set<String> DATE_PRESETS = Set.of("day", "week", "month", "year");
    private static final Pattern SINGLE_DATE = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})$");
    private static final Pattern CLOSED_RANGE = Pattern.compile(
            "^(\\d{4}-\\d{2}-\\d{2})\\.\\.(\\d{4}-\\d{2}-\\d{2})$");
    private static final Pattern OPEN_RIGHT = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})\\.\\.$");
    private static final Pattern OPEN_LEFT = Pattern.compile("^\\.\\.(\\d{4}-\\d{2}-\\d{2})$");

    private final String query;
    private final Integer limit;
    private final Integer offset;
    /**
     * Freshness filter, mutually exclusive forms:
     * preset ({@code day|week|month|year}), {@code YYYY-MM-DD},
     * {@code YYYY-MM-DD..YYYY-MM-DD}, {@code YYYY-MM-DD..}, {@code ..YYYY-MM-DD}.
     */
    private final String dateRange;
    private final LocaleSettings locale;
    private final Topic topic;
    private final List<String> includeDomains;
    private final List<String> excludeDomains;
    private final ContentOptions content;
    private final Boolean safeSearch;

    private SearchRequest(Builder b) {
        this.query = b.query;
        this.limit = b.limit;
        this.offset = b.offset;
        this.dateRange = b.dateRange;
        this.locale = b.locale;
        this.topic = b.topic;
        this.includeDomains = b.includeDomains == null ? null : List.copyOf(b.includeDomains);
        this.excludeDomains = b.excludeDomains == null ? null : List.copyOf(b.excludeDomains);
        this.content = b.content;
        this.safeSearch = b.safeSearch;
    }

    public static Builder builder() {
        return new Builder();
    }

    public String query() { return query; }
    public Integer limit() { return limit; }
    public Integer offset() { return offset; }
    public String dateRange() { return dateRange; }
    public LocaleSettings locale() { return locale; }
    public Topic topic() { return topic; }
    /** Immutable; null when unset. */
    public List<String> includeDomains() { return includeDomains; }
    /** Immutable; null when unset. */
    public List<String> excludeDomains() { return excludeDomains; }
    public ContentOptions content() { return content; }
    public Boolean safeSearch() { return safeSearch; }

    public static final class Builder {
        private String query;
        private Integer limit;
        private Integer offset;
        private String dateRange;
        private LocaleSettings locale;
        private Topic topic;
        private List<String> includeDomains;
        private List<String> excludeDomains;
        private ContentOptions content;
        private Boolean safeSearch;

        public Builder query(String query) { this.query = query; return this; }
        public Builder limit(Integer limit) { this.limit = limit; return this; }
        public Builder offset(Integer offset) { this.offset = offset; return this; }
        public Builder dateRange(String dateRange) { this.dateRange = dateRange; return this; }
        public Builder locale(LocaleSettings locale) { this.locale = locale; return this; }
        public Builder topic(Topic topic) { this.topic = topic; return this; }
        public Builder includeDomains(List<String> domains) { this.includeDomains = domains; return this; }
        public Builder excludeDomains(List<String> domains) { this.excludeDomains = domains; return this; }
        public Builder content(ContentOptions content) { this.content = content; return this; }
        public Builder safeSearch(Boolean safeSearch) { this.safeSearch = safeSearch; return this; }

        public SearchRequest build() {
            if (query == null || query.trim().isEmpty()) {
                throw new IllegalArgumentException("query is required");
            }
            if (query.length() > 2000) {
                throw new IllegalArgumentException("query must not exceed 2000 characters");
            }
            requireRange(limit, 1, 50, "limit");
            requireRange(offset, 0, 1000, "offset");
            requireMaxSize(includeDomains, 300, "includeDomains");
            requireMaxSize(excludeDomains, 300, "excludeDomains");
            validateDateRange(dateRange);
            return new SearchRequest(this);
        }

        private static void requireRange(Integer value, int min, int max, String name) {
            if (value != null && (value < min || value > max)) {
                throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
            }
        }

        private static void requireMaxSize(List<String> values, int max, String name) {
            if (values != null && values.size() > max) {
                throw new IllegalArgumentException(name + " must not exceed " + max + " entries");
            }
        }

        private static void validateDateRange(String value) {
            if (value == null || value.isBlank() || DATE_PRESETS.contains(value)) {
                return;
            }
            Matcher single = SINGLE_DATE.matcher(value);
            Matcher openRight = OPEN_RIGHT.matcher(value);
            Matcher openLeft = OPEN_LEFT.matcher(value);
            Matcher closed = CLOSED_RANGE.matcher(value);
            if (single.matches()) {
                parseDate(single.group(1));
                return;
            }
            if (openRight.matches()) {
                parseDate(openRight.group(1));
                return;
            }
            if (openLeft.matches()) {
                parseDate(openLeft.group(1));
                return;
            }
            if (closed.matches()) {
                LocalDate start = parseDate(closed.group(1));
                LocalDate end = parseDate(closed.group(2));
                if (end.isBefore(start)) {
                    throw new IllegalArgumentException(
                            "dateRange end date must be on or after the start date");
                }
                return;
            }
            throw new IllegalArgumentException(
                    "dateRange must be day|week|month|year, YYYY-MM-DD, "
                            + "YYYY-MM-DD..YYYY-MM-DD, YYYY-MM-DD.., or ..YYYY-MM-DD");
        }

        private static LocalDate parseDate(String value) {
            try {
                return LocalDate.parse(value);
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException(
                        "dateRange contains an invalid calendar date: " + value, e);
            }
        }
    }
}
