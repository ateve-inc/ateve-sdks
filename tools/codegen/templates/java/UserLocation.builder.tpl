        public UserLocation build() {
            if (country != null && !country.matches({{country.patternJava}})) {
                throw new IllegalArgumentException(
                        "country must be an uppercase ISO 3166-1 alpha-2 code");
            }
            if (timezone != null && !ZoneId.getAvailableZoneIds().contains(timezone)) {
                throw new IllegalArgumentException(
                        "timezone must be a valid IANA Time Zone identifier");
            }
            return new UserLocation(this);
        }
