from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from ateve import ContentOptions, ImageItem, SearchRequest, SearchResponse, SearchResult


def test_request_models_preserve_validation_and_frozen_configuration() -> None:
    request = SearchRequest(query="query", limit="2")  # type: ignore[arg-type]
    assert request.limit == 2  # Existing Pydantic coercion remains supported.
    with pytest.raises(ValidationError):
        SearchRequest(query="query", unknown=True)  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        request.query = "changed"
    with pytest.raises(ValidationError):
        ContentOptions(max_characters=True)


def test_response_models_preserve_defaults_nulls_extra_fields_and_dates() -> None:
    image = ImageItem(url="https://example.com/image.png")
    assert image.width is None and image.alt is None
    result = SearchResult(
        published_at="2026-06-12T08:30:00.000Z", summary=None, future_field="kept"
    )
    assert result.images == []
    assert result.summary is None
    assert result.published_at == datetime(2026, 6, 12, 8, 30, tzinfo=timezone.utc)
    assert result.model_extra == {"future_field": "kept"}
    with pytest.raises(ValidationError):
        SearchResponse(id="request", created=1, latency_ms=1, query={"original": "query"})


def test_request_lists_are_snapshots_and_wire_names_stay_snake_case() -> None:
    domains = ["example.com"]
    request = SearchRequest(query="query", include_domains=domains, safe_search=False)
    domains.append("changed.com")
    assert request.include_domains == ["example.com"]
    assert request.model_dump(mode="json", exclude_none=True) == {
        "query": "query", "include_domains": ["example.com"], "safe_search": False
    }
