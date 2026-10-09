import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from ateve import (
    ContentFormat,
    ContentOptions,
    ImageItem,
    SearchRequest,
    SearchResponse,
    SearchResult,
    TextOptions,
)


def test_request_models_preserve_validation_and_frozen_configuration() -> None:
    request = SearchRequest(query="query", max_results="2")  # type: ignore[arg-type]
    assert request.max_results == 2  # Existing Pydantic coercion remains supported.
    with pytest.raises(ValidationError):
        SearchRequest(query="query", unknown=True)  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        request.query = "changed"
    with pytest.raises(ValidationError):
        TextOptions(max_characters=True)


def test_response_models_preserve_defaults_nulls_extra_fields_and_dates() -> None:
    image = ImageItem(url="https://example.com/image.png")
    assert image.width is None and image.alt is None
    result = SearchResult(published_at="2026-06-12T08:30:00.000Z", text=None, future_field="kept")
    assert result.images == []
    assert result.text is None
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
        "query": "query",
        "max_results": 10,
        "include_domains": ["example.com"],
        "safe_search": False,
    }


def test_request_defaults_and_nested_text_activation() -> None:
    assert SearchRequest(query="q").max_results == 10
    assert ContentOptions().snippet is True
    assert ContentOptions().text is None
    assert TextOptions().format == ContentFormat.TEXT
    request = SearchRequest(query="q", content=ContentOptions(text=TextOptions()))
    assert request.model_dump(mode="json", exclude_none=True) == {
        "query": "q",
        "max_results": 10,
        "content": {"snippet": True, "text": {"format": "text"}},
    }
    assert ContentOptions(snippet=False).model_dump(exclude_none=True) == {"snippet": False}


@pytest.mark.parametrize("value", [0, -1, 101])
def test_max_results_range(value: int) -> None:
    with pytest.raises(ValidationError):
        SearchRequest(query="q", max_results=value)
    assert SearchRequest(query="q", max_results=1).max_results == 1
    assert SearchRequest(query="q", max_results=100).max_results == 100


@pytest.mark.parametrize("value", [0, -1, 2147483648, True, 1.5, "5000"])
def test_text_character_limit_is_strict_and_bounded(value: object) -> None:
    with pytest.raises(ValidationError):
        TextOptions.model_validate({"max_characters": value})
    assert TextOptions(max_characters=2147483647).max_characters == 2147483647


def test_removed_request_fields_and_invalid_text_options_are_rejected() -> None:
    for name, value in [("limit", 10), ("offset", 0), ("contents", {})]:
        with pytest.raises(ValidationError):
            SearchRequest.model_validate({"query": "q", name: value})
    for name, value in [
        ("summary", True),
        ("highlights", True),
        ("raw_content", True),
        ("max_characters", 100),
        ("format", "text"),
    ]:
        with pytest.raises(ValidationError):
            ContentOptions.model_validate({name: value})
    for value in [True, {"format": "html"}]:
        with pytest.raises(ValidationError):
            ContentOptions.model_validate({"text": value})


@pytest.mark.parametrize("scenario", ["default", "text", "markdown", "no-snippet"])
def test_captured_live_responses_preserve_missing_and_null_text(scenario: str) -> None:
    fixture = (
        Path(__file__).resolve().parents[2] / f"contract/fixtures/live-{scenario}-response.json"
    )
    wire = json.loads(fixture.read_text())
    response = SearchResponse.model_validate(wire)
    assert response.query.original == "Python programming language"
    assert response.model_extra == {}
    assert len(response.results) == len(wire["results"])
    for result, raw in zip(response.results, wire["results"], strict=True):
        assert result.text == raw.get("text")
        assert result.snippet == raw.get("snippet")
        assert ("text" in result.model_fields_set) == ("text" in raw)
        assert ("snippet" in result.model_fields_set) == ("snippet" in raw)
        assert result.model_extra == {}
    if scenario in {"text", "markdown"}:
        assert response.results[0].text is not None and len(response.results[0].text) == 300
        assert response.results[1].text is None
        assert response.results[0].snippet is not None
        assert response.results[0].text.startswith("# ") == (scenario == "markdown")
