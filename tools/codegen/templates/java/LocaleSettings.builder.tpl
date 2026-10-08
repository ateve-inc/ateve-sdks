        public LocaleSettings build() {
            if (mkt != null && !mkt.matches({{mkt.patternJava}})) {
                throw new IllegalArgumentException(
                        "mkt must be an uppercase ISO 3166-1 alpha-2 code");
            }
            if (language != null && !language.matches({{language.patternJava}})) {
                throw new IllegalArgumentException(
                        "language must be a lowercase ISO 639-1 code");
            }
            return new LocaleSettings(this);
        }
