    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query is required")
        return value

    @field_validator("date_range")
    @classmethod
    def date_range_must_be_valid(cls, value: Optional[str]) -> Optional[str]:
        return _validate_date_range(value)

    @model_validator(mode="after")
    def copy_domain_lists(self) -> SearchRequest:
        # Pydantic already copies normal inputs; this assertion keeps the
        # validation path explicit and rejects null list entries consistently.
        for name in ("include_domains", "exclude_domains"):
            domains = getattr(self, name)
            if domains is not None and any(domain is None for domain in domains):
                raise ValueError(f"{name} must not contain null entries")
        return self
