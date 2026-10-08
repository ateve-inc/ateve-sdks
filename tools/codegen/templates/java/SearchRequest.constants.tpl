    private static final Set<String> DATE_PRESETS = Set.of("day", "week", "month", "year");
    private static final Pattern SINGLE_DATE = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})$");
    private static final Pattern CLOSED_RANGE = Pattern.compile(
            "^(\\d{4}-\\d{2}-\\d{2})\\.\\.(\\d{4}-\\d{2}-\\d{2})$");
    private static final Pattern OPEN_RIGHT = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})\\.\\.$");
    private static final Pattern OPEN_LEFT = Pattern.compile("^\\.\\.(\\d{4}-\\d{2}-\\d{2})$");
