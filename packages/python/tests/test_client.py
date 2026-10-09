import asyncio
import json
import threading
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from ateve import (
    ApiConnectionError,
    ApiResponseError,
    AsyncAteve,
    Ateve,
    ConcurrencyLimitError,
    ContentFormat,
    ContentOptions,
    LocaleSettings,
    PaymentRequiredError,
    RateLimitError,
    SearchRequest,
    ServerError,
    TextOptions,
    UserLocation,
    __version__,
)

GOLDEN_RESPONSE = json.loads(
    (Path(__file__).resolve().parents[2] / "contract/fixtures/golden-response.json").read_text()
)


def json_response(
    status: int = 200, body: object = GOLDEN_RESPONSE, **headers: str
) -> httpx.Response:
    return httpx.Response(
        status,
        json=body,
        headers={"X-Request-Id": "req_header", **headers},
    )


def test_sync_golden_contract_and_wire_names() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return json_response()

    transport = httpx.MockTransport(handler)
    external = httpx.Client(transport=transport)
    client = Ateve("sk_test", base_url="https://api.test", http_client=external)

    response = client.search(
        "climate policy analysis",
        max_results=20,
        date_range="2026-01-01..2026-06-30",
        locale=LocaleSettings(mkt="US", language="en"),
        content=ContentOptions(
            snippet=False, text=TextOptions(format=ContentFormat.MARKDOWN, max_characters=5000)
        ),
        safe_search=False,
    )

    payload = json.loads(captured[0].content)
    assert payload["date_range"] == "2026-01-01..2026-06-30"
    assert payload["safe_search"] is False
    assert payload["max_results"] == 20
    assert payload["content"]["snippet"] is False
    assert not {"limit", "offset", "contents"}.intersection(payload)
    assert payload["content"]["text"]["max_characters"] == 5000
    assert "images" not in payload["content"]
    assert "topic" not in payload
    assert payload["content"]["text"]["format"] == "markdown"
    assert "dateRange" not in payload
    assert captured[0].headers["Authorization"] == "Bearer sk_test"
    assert captured[0].headers["User-Agent"] == f"ateve-python/{__version__}"
    assert response.id == "req_01J9ZK3V6XQ8"
    assert response.results[0].published_at is not None
    assert response.query.original == "climate policy analysis"
    assert response.total_estimated_matches == 128000


def test_no_retry_and_structured_rate_limit_metadata() -> None:
    hits = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal hits
        hits += 1
        return json_response(
            429,
            {
                "id": "req_rate",
                "error": {
                    "code": "rate_limit_exceeded",
                    "message": "Slow down.",
                    "type": "rate_limit_error",
                },
            },
            **{"Retry-After": "7", "X-Ateve-Limit-Scope": "qpm"},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as external:
        client = Ateve("sk_test", http_client=external)
        with pytest.raises(RateLimitError) as caught:
            client.search("q")

    assert hits == 1
    assert caught.value.request_id == "req_rate"
    assert caught.value.retry_after_seconds == 7
    assert caught.value.limit_scope == "qpm"
    assert caught.value.is_retryable


def test_billing_403_is_distinct_from_permission_error() -> None:
    response = {
        "id": "req_billing",
        "error": {
            "code": "insufficient_credit",
            "message": "Low credit.",
            "type": "invalid_request_error",
        },
    }
    external = httpx.Client(
        transport=httpx.MockTransport(lambda request: json_response(403, response))
    )
    try:
        client = Ateve("sk_test", http_client=external)
        with pytest.raises(PaymentRequiredError) as caught:
            client.search("q")
        assert caught.value.status_code == 403
    finally:
        external.close()


def test_non_json_error_uses_header_request_id_without_leaking_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            502,
            text="<html>internal gateway detail</html>",
            headers={"X-Request-Id": "req_gateway"},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as external:
        client = Ateve("sk_test", http_client=external)
        with pytest.raises(ServerError) as caught:
            client.search("q")

    assert caught.value.request_id == "req_gateway"
    assert str(caught.value) == "HTTP 502"
    assert "gateway detail" not in str(caught.value)


def test_malformed_success_is_typed_as_possibly_billed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="<html>not json</html>",
            headers={"X-Request-Id": "req_bad"},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as external:
        client = Ateve("sk_test", base_url="https://api.test", http_client=external)
        with pytest.raises(ApiResponseError) as caught:
            client.search("q")

    assert caught.value.status_code == 200
    assert caught.value.request_id == "req_bad"
    assert caught.value.request_may_have_been_sent
    assert "<html>" not in str(caught.value)


def test_structurally_incomplete_success_is_typed_as_possibly_billed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"id": "req_incomplete"},
            headers={"X-Request-Id": "req_incomplete"},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as external:
        client = Ateve("sk_test", base_url="https://api.test", http_client=external)
        with pytest.raises(ApiResponseError) as caught:
            client.search("q")

    assert caught.value.status_code == 200
    assert caught.value.request_id == "req_incomplete"
    assert caught.value.request_may_have_been_sent


@pytest.mark.parametrize(
    ("transport_error", "may_have_been_sent"),
    [
        (httpx.ConnectError("refused"), False),
        (httpx.ConnectTimeout("connect timeout"), False),
        (httpx.ReadTimeout("read timeout"), True),
        (httpx.ReadError("reset"), True),
    ],
)
def test_transport_delivery_metadata(
    transport_error: httpx.HTTPError, may_have_been_sent: bool
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise transport_error

    with httpx.Client(transport=httpx.MockTransport(handler)) as external:
        client = Ateve("sk_test", http_client=external)
        with pytest.raises(ApiConnectionError) as caught:
            client.search("q")

    assert caught.value.request_may_have_been_sent is may_have_been_sent
    assert caught.value.__cause__ is transport_error


def test_response_body_limit_is_enforced() -> None:
    with httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"x" * 65))
    ) as external:
        client = Ateve("sk_test", http_client=external, max_response_bytes=64)
        with pytest.raises(ApiConnectionError) as caught:
            client.search("q")

    assert caught.value.request_may_have_been_sent
    assert "max_response_bytes=64" in str(caught.value)


def test_external_client_is_borrowed_not_closed() -> None:
    external = httpx.Client(transport=httpx.MockTransport(lambda request: json_response()))
    client = Ateve("sk_test", http_client=external)
    client.search("q")
    client.close()

    assert not external.is_closed
    with pytest.raises(RuntimeError, match="closed"):
        client.search("q")
    external.close()


def test_sync_bulkhead_fails_fast_and_recovers() -> None:
    entered = threading.Event()
    release = threading.Event()

    def handler(request: httpx.Request) -> httpx.Response:
        entered.set()
        release.wait(2)
        return json_response()

    external = httpx.Client(transport=httpx.MockTransport(handler))
    client = Ateve("sk_test", http_client=external, max_concurrent_requests=1)
    result: list[object] = []
    worker = threading.Thread(target=lambda: result.append(client.search("first")))
    worker.start()
    assert entered.wait(1)
    with pytest.raises(ConcurrencyLimitError):
        client.search("second")
    release.set()
    worker.join(2)
    assert result
    assert client.search("third").id == "req_01J9ZK3V6XQ8"
    external.close()


def test_request_validation_and_endpoint_hardening() -> None:
    with pytest.raises(ValidationError):
        SearchRequest(query=" ")
    with pytest.raises(ValidationError):
        SearchRequest(query="q", max_results=0)
    with pytest.raises(ValidationError):
        SearchRequest(query="q", date_range="2026-02-31")
    with pytest.raises(ValidationError):
        TextOptions(max_characters=0)
    with pytest.raises(ValidationError):
        LocaleSettings(mkt="us")
    with pytest.raises(ValidationError):
        UserLocation(timezone="PST")
    with pytest.raises(ValueError):
        Ateve("key\r\nX-Evil: injected")
    with pytest.raises(ValueError):
        Ateve("key", base_url="https://user:password@api.ateve.ai")


def test_async_client_contract_bulkhead_and_borrowed_lifecycle() -> None:
    async def scenario() -> None:
        entered = asyncio.Event()
        release = asyncio.Event()
        hits = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal hits
            hits += 1
            entered.set()
            await release.wait()
            return json_response()

        external = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        client = AsyncAteve("sk_test", http_client=external, max_concurrent_requests=1)
        first = asyncio.create_task(client.search("first"))
        await asyncio.wait_for(entered.wait(), timeout=1)
        with pytest.raises(ConcurrencyLimitError):
            await client.search("second")
        release.set()
        assert (await first).id == "req_01J9ZK3V6XQ8"
        assert (await client.search("third")).id == "req_01J9ZK3V6XQ8"
        assert hits == 2
        await client.aclose()
        assert not external.is_closed
        await external.aclose()

    asyncio.run(scenario())


def test_max_results_and_removed_parameters() -> None:
    assert SearchRequest(query="q", max_results=100).max_results == 100
    assert TextOptions(max_characters=9000).max_characters == 9000
    with pytest.raises(ValidationError):
        SearchRequest(query="q", max_results=101)
    with pytest.raises(ValidationError):
        SearchRequest.model_validate({"query": "q", "topic": "news"})
    with pytest.raises(ValidationError):
        ContentOptions.model_validate({"images": 3})


def test_sync_and_async_send_new_defaults_and_nested_text_options() -> None:
    payloads: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payloads.append(json.loads(request.content))
        return json_response()

    with (
        httpx.Client(transport=httpx.MockTransport(handler)) as transport,
        Ateve("sk_test", http_client=transport) as client,
    ):
        client.search("q")
        client.search("q", content=ContentOptions(text=TextOptions()))
        with pytest.raises(TypeError, match="options cannot be combined"):
            client.search(SearchRequest(query="q"), max_results=1)

    async def scenario() -> None:
        async with (
            httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport,
            AsyncAteve("sk_test", http_client=transport) as client,
        ):
            await client.search("q", max_results=100, content=ContentOptions(snippet=False))
            await client.search(
                SearchRequest(query="q", content=ContentOptions(text=TextOptions()))
            )

    asyncio.run(scenario())
    assert payloads == [
        {"query": "q", "max_results": 10},
        {
            "query": "q",
            "max_results": 10,
            "content": {"snippet": True, "text": {"format": "text"}},
        },
        {"query": "q", "max_results": 100, "content": {"snippet": False}},
        {
            "query": "q",
            "max_results": 10,
            "content": {"snippet": True, "text": {"format": "text"}},
        },
    ]
