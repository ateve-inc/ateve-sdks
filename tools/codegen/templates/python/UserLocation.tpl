    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("timezone must be a valid IANA Time Zone identifier") from exc
        if value in {"PST", "EST", "CST", "MST"} or re.match(r"^UTC[+-]", value):
            raise ValueError("timezone must be a region-based IANA identifier")
        return value
