import json
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from ateve import AsyncAteve, Ateve, ImageSearchRequest, VideoSearchRequest

FIXTURES = Path(__file__).resolve().parents[2] / "contract" / "fixtures"


def media_response(request: httpx.Request) -> httpx.Response:
    resource = request.url.path.removeprefix("/prefix/v1/")
    assert resource in {"images", "videos"}
    expected = {"query": "Webb"} if resource == "images" else {"query": "Webb", "max_results": 2}
    assert json.loads(request.content) == expected
    return httpx.Response(200, content=(FIXTURES / f"{resource}-response.json").read_bytes())


def test_media_search() -> None:
    with httpx.Client(transport=httpx.MockTransport(media_response)) as http:
        client = Ateve("test", base_url="http://local/prefix", http_client=http)
        images = client.search_images(ImageSearchRequest(query="Webb"))
        videos = client.search_videos("Webb", max_results=2)
        assert images.results[0].host_page_url == "https://example.org/webb"
        assert videos.results[0].duration_seconds == 180
        assert videos.results[1].url is None
        assert videos.results[1].embedding_url == "https://example.org/embed/mirror"


@pytest.mark.asyncio
async def test_async_media_search() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(media_response)) as http:
        client = AsyncAteve("test", base_url="http://local/prefix", http_client=http)
        assert (await client.search_images("Webb")).results[1].published_at is None
        request = VideoSearchRequest(query="Webb", max_results=2)
        assert (await client.search_videos(request)).results[0].site_name == "Example Observatory"
        with pytest.raises(TypeError):
            await client.search_videos(request, max_results=1)


@pytest.mark.parametrize("model", [ImageSearchRequest, VideoSearchRequest])
def test_media_limits(model: type[ImageSearchRequest] | type[VideoSearchRequest]) -> None:
    assert model(query="🌍" * 1000, max_results=10).max_results == 10
    for query, limit in [("   ", 1), ("x" * 1001, 1), ("x", 0), ("x", 11)]:
        with pytest.raises(ValidationError):
            model(query=query, max_results=limit)
