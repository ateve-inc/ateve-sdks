        public SearchRequest build() {
            if (query == null || query.trim().isEmpty()) {
                throw new IllegalArgumentException("query is required");
            }
            if (query.length() > {{query.maxLength}}) {
                throw new IllegalArgumentException("query must not exceed {{query.maxLength}} characters");
            }
            requireRange(limit, {{limit.minimum}}, {{limit.maximum}}, "limit");
            requireRange(offset, {{offset.minimum}}, {{offset.maximum}}, "offset");
            requireMaxSize(includeDomains, {{include_domains.maxItems}}, "includeDomains");
            requireMaxSize(excludeDomains, {{exclude_domains.maxItems}}, "excludeDomains");
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
