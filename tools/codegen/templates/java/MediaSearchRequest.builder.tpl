        public {{name}} build() {
            if (query == null || query.isBlank() || query.codePointCount(0, query.length()) > {{query.maxLength}}) {
                throw new IllegalArgumentException("query must be nonblank and at most {{query.maxLength}} characters");
            }
            if (maxResults != null && (maxResults < {{max_results.minimum}} || maxResults > {{max_results.maximum}})) {
                throw new IllegalArgumentException("maxResults must be between {{max_results.minimum}} and {{max_results.maximum}}");
            }
            return new {{name}}(this);
        }
