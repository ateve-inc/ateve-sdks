import json
from datetime import date
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from ateve import (
    ApiResponseError,
    AsyncAteve,
    Ateve,
    ChoiceAnswer,
    DecisionRequest,
    InvalidRequestError,
    NoulAnswer,
    ScoreAnswer,
    ServerError,
)

FIXTURES = Path(__file__).resolve().parents[2] / "contract" / "fixtures"
URL = "https://example.org/page?lang=中文"
DECISION = DecisionRequest.model_validate_json((FIXTURES / "decision-request.json").read_bytes())


def exchange(request: httpx.Request) -> httpx.Response:
    assert request.headers["Authorization"] == "Bearer test"
    match request.url.path:
        case "/prefix/v1/fetch":
            assert request.method == "POST"
            assert request.headers["Content-Type"] == "application/json"
            assert json.loads(request.content) == {"url": URL}
            fixture = "fetch"
        case "/prefix/v1/systemone":
            assert request.method == "POST"
            expected = json.loads((FIXTURES / "decision-request.json").read_bytes())
            assert json.loads(request.content) == expected
            fixture = "decision"
        case "/prefix/v1/models":
            assert request.method == "GET" and request.content == b""
            assert "Content-Type" not in request.headers
            fixture = "models"
        case _:
            raise AssertionError(f"Unexpected route {request.url.path}")
    return httpx.Response(200, content=(FIXTURES / f"{fixture}-response.json").read_bytes())


def test_content_sync() -> None:
    with httpx.Client(transport=httpx.MockTransport(exchange)) as http:
        client = Ateve("test", base_url="https://example.org/prefix", http_client=http)
        expected = json.loads((FIXTURES / "fetch-response.json").read_bytes())
        assert client.fetch(URL).model_dump() == expected
        response = client.decisions.decide(DECISION)
        choice = response.answers["category"]
        score = response.answers["quality"]
        noul = response.answers["approved"]
        assert isinstance(choice, ChoiceAnswer) and choice.choice == "below"
        assert isinstance(score, ScoreAnswer) and score.score == 1.85
        assert score.legend["2"] == ["High", True]
        assert isinstance(noul, NoulAnswer) and noul.noul == 0.98
        assert response.usage.input_tokens == 1077 and response.usage.output_tokens == 0
        model = client.decisions.list_models().models[1]
        assert model.name == "jev-latest" and model.release_date == date(2026, 10, 2)


@pytest.mark.asyncio
async def test_content_async() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(exchange)) as http:
        client = AsyncAteve("test", base_url="https://example.org/prefix", http_client=http)
        markdown = (await client.fetch(URL)).content
        assert "\n| --- | --- |\n" in markdown and "\n```js\n" in markdown
        decisions = client.decisions
        response = await decisions.decide(DECISION)
        assert isinstance(response.answers["approved"], NoulAnswer)
        assert (await decisions.list_models()).models[0].name == "ateve-jev-v1"
        await client.aclose()
        with pytest.raises(RuntimeError, match="Ateve client is closed"):
            await decisions.list_models()


def test_content_errors() -> None:
    replies = iter([
        httpx.Response(
            404,
            headers={"X-Request-Id": "req_fetch"},
            json={"error": {"code": "fetch_content_unavailable", "message": "No content"}},
        ),
        httpx.Response(
            400,
            json={"id": "req_budget", "error": {
                "code": "token_budget_exceeded", "details": {"limit_tokens": 100},
            }},
        ),
        httpx.Response(502, headers={"Retry-After": "5"}),
        httpx.Response(200, json={"models": [{"name": "ateve-jev-v1"}]}),
    ])
    with httpx.Client(transport=httpx.MockTransport(lambda _: next(replies))) as http:
        client = Ateve("test", http_client=http)
        with pytest.raises(InvalidRequestError, match="No content") as error:
            client.fetch(URL)
        assert error.value.status_code == 404 and error.value.request_id == "req_fetch"
        assert error.value.code == "fetch_content_unavailable"
        with pytest.raises(InvalidRequestError) as error:
            client.decisions.decide(DECISION)
        assert error.value.request_id == "req_budget"
        assert error.value.details == {"limit_tokens": 100}
        with pytest.raises(ServerError) as server:
            client.decisions.decide(DECISION)
        assert server.value.retry_after_seconds == 5
        with pytest.raises(ApiResponseError):
            client.decisions.list_models()
    assert next(replies, None) is None


@pytest.mark.parametrize(("question", "invalid"), [
    ({"type": "choice", "criteria": {"a": None}}, True),
    ({"type": "score", "criteria": []}, True),
    ({"type": "noul", "criteria": {"other": "Unsupported"}}, True),
    ({"type": "noul", "instructions": "x" * 8193}, True),
    ({"type": "noul", "instructions": ["x"] * 8193}, False),
    ({"type": "noul"}, False),
])
def test_decision_question_constraints(question: dict, invalid: bool) -> None:
    data = {"state": "context", "questions": {"q": question}}
    if invalid:
        with pytest.raises(ValidationError):
            DecisionRequest.model_validate(data)
    else:
        assert isinstance(DecisionRequest.model_validate(data).questions["q"].type, str)
