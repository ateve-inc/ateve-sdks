"""Synchronous and asynchronous Ateve Search API clients."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional, Union
from urllib.parse import urlsplit, urlunsplit

import httpx
from pydantic import ValidationError

from ._version import __version__
from .errors import (
    ApiConnectionError,
    ApiResponseError,
    AuthenticationError,
    ConcurrencyLimitError,
    InvalidRequestError,
    PaymentRequiredError,
    RateLimitError,
    ServerError,
)
from .models import (
    ContentOptions,
    LocaleSettings,
    SearchRequest,
    SearchResponse,
)

DEFAULT_BASE_URL = "https://api.ateve.ai"
DEFAULT_TIMEOUT = 60.0
DEFAULT_CONNECT_TIMEOUT = 5.0
DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024
USER_AGENT = f"ateve-python/{__version__}"
_BILLING_CODES = {"insufficient_credit", "credit_limit_exceeded", "payment_required"}


class _BodyLimitExceeded(Exception):
    pass


def _require_api_key(api_key: Optional[str]) -> str:
    value = api_key if api_key is not None else os.getenv("ATEVE_API_KEY")
    if value is None or not value.strip():
        raise ValueError("API key missing: pass api_key or set ATEVE_API_KEY")
    value = value.strip()
    if any(character in value for character in ("\r", "\n", "\0")):
        raise ValueError("api_key must not contain CR, LF, or NUL characters")
    return value


def _normalize_base_url(base_url: Optional[str]) -> str:
    value = base_url if base_url is not None else os.getenv("ATEVE_BASE_URL", DEFAULT_BASE_URL)
    value = value.strip().rstrip("/")
    parsed = urlsplit(value)
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(
            "base_url must be an absolute http(s) URL without user-info, query, or fragment"
        )
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, parsed.path, "", ""))


def _timeout(timeout: float, connect_timeout: float) -> httpx.Timeout:
    if timeout <= 0 or connect_timeout <= 0:
        raise ValueError("timeout and connect_timeout must be positive")
    return httpx.Timeout(timeout, connect=connect_timeout)


def _request_from_args(
    query: Union[str, SearchRequest],
    *,
    max_results: Optional[int],
    date_range: Optional[str],
    locale: Optional[LocaleSettings],
    include_domains: Optional[list[str]],
    exclude_domains: Optional[list[str]],
    content: Optional[ContentOptions],
    safe_search: Optional[bool],
) -> SearchRequest:
    options = (
        max_results,
        date_range,
        locale,
        include_domains,
        exclude_domains,
        content,
        safe_search,
    )
    if isinstance(query, SearchRequest):
        if any(value is not None for value in options):
            raise TypeError("options cannot be combined with a SearchRequest instance")
        return query
    return SearchRequest(
        query=query,
        **({"max_results": max_results} if max_results is not None else {}),
        date_range=date_range,
        locale=locale,
        include_domains=include_domains,
        exclude_domains=exclude_domains,
        content=content,
        safe_search=safe_search,
    )


def _parse_retry_after(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return max(0, int(value.strip()))
    except ValueError:
        pass
    try:
        when = parsedate_to_datetime(value)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return max(0, int((when - datetime.now(timezone.utc)).total_seconds()))
    except (TypeError, ValueError, OverflowError):
        return None


def _read_json_object(body: bytes) -> Dict[str, Any]:
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _map_api_error(response: httpx.Response, body: bytes) -> Exception:
    payload = _read_json_object(body)
    error = payload.get("error")
    error = error if isinstance(error, dict) else {}
    raw_request_id = payload.get("id") or response.headers.get("X-Request-Id")
    status = response.status_code
    raw_message = error.get("message")
    message = raw_message if isinstance(raw_message, str) else f"HTTP {status}"
    request_id = raw_request_id if isinstance(raw_request_id, str) else None
    raw_code = error.get("code")
    code = raw_code if isinstance(raw_code, str) else None
    raw_param = error.get("param")
    param = raw_param if isinstance(raw_param, str) else None
    raw_type = error.get("type")
    error_type = raw_type if isinstance(raw_type, str) else None
    raw_doc_url = error.get("doc_url")
    doc_url = raw_doc_url if isinstance(raw_doc_url, str) else None
    if status == 401:
        return AuthenticationError(
            message,
            status_code=status,
            request_id=request_id,
            code=code,
            param=param,
            error_type=error_type,
            doc_url=doc_url,
        )
    if status == 402 or (status == 403 and code in _BILLING_CODES):
        return PaymentRequiredError(
            message,
            status_code=status,
            request_id=request_id,
            code=code,
            param=param,
            error_type=error_type,
            doc_url=doc_url,
        )
    if status == 429:
        return RateLimitError(
            message,
            status_code=status,
            request_id=request_id,
            code=code,
            param=param,
            error_type=error_type,
            doc_url=doc_url,
            retry_after_seconds=_parse_retry_after(response.headers.get("Retry-After")),
            limit_scope=response.headers.get("X-Ateve-Limit-Scope"),
        )
    if status >= 500:
        return ServerError(
            message,
            status_code=status,
            request_id=request_id,
            code=code,
            param=param,
            error_type=error_type,
            doc_url=doc_url,
        )
    return InvalidRequestError(
        message,
        status_code=status,
        request_id=request_id,
        code=code,
        param=param,
        error_type=error_type,
        doc_url=doc_url,
    )


def _request_may_have_been_sent(error: httpx.HTTPError) -> bool:
    return not isinstance(
        error,
        (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.PoolTimeout,
            httpx.InvalidURL,
            httpx.UnsupportedProtocol,
        ),
    )


def _validate_limits(max_response_bytes: int, max_concurrent_requests: int) -> None:
    if max_response_bytes < 0:
        raise ValueError("max_response_bytes must be >= 0")
    if max_concurrent_requests < 0:
        raise ValueError("max_concurrent_requests must be >= 0")


class _BaseAteve:
    def __init__(
        self,
        *,
        api_key: Optional[str],
        base_url: Optional[str],
        timeout: float,
        connect_timeout: float,
        max_response_bytes: int,
        max_concurrent_requests: int,
    ) -> None:
        _validate_limits(max_response_bytes, max_concurrent_requests)
        self._base_url = _normalize_base_url(base_url)
        self._search_url = self._base_url + "/v1/search"
        self._timeout = _timeout(timeout, connect_timeout)
        self._max_response_bytes = max_response_bytes
        self._max_concurrent_requests = max_concurrent_requests
        self._headers = {
            "Authorization": f"Bearer {_require_api_key(api_key)}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        }
        self._closed = False

    def _ensure_open(self) -> None:
        if self._closed:
            raise RuntimeError("Ateve client is closed")

    def _decode(self, response: httpx.Response, body: bytes) -> SearchResponse:
        if not 200 <= response.status_code < 300:
            raise _map_api_error(response, body)
        try:
            return SearchResponse.model_validate_json(body)
        except ValidationError as exc:
            raise ApiResponseError(
                f"Response from {self._base_url} could not be decoded as SearchResponse",
                status_code=response.status_code,
                request_id=response.headers.get("X-Request-Id"),
                base_url=self._base_url,
            ) from exc


class Ateve(_BaseAteve):
    """Reusable synchronous client. Close it when the owning application stops."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        connect_timeout: float = DEFAULT_CONNECT_TIMEOUT,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
        max_concurrent_requests: int = 0,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            connect_timeout=connect_timeout,
            max_response_bytes=max_response_bytes,
            max_concurrent_requests=max_concurrent_requests,
        )
        self._owns_http_client = http_client is None
        self._client = http_client or httpx.Client(timeout=self._timeout, follow_redirects=False)
        self._bulkhead = (
            threading.BoundedSemaphore(max_concurrent_requests)
            if max_concurrent_requests > 0
            else None
        )

    def search(
        self,
        query: Union[str, SearchRequest],
        *,
        max_results: Optional[int] = None,
        date_range: Optional[str] = None,
        locale: Optional[LocaleSettings] = None,
        include_domains: Optional[list[str]] = None,
        exclude_domains: Optional[list[str]] = None,
        content: Optional[ContentOptions] = None,
        safe_search: Optional[bool] = None,
    ) -> SearchResponse:
        """Send exactly one search request; no retries or endpoint failover."""
        self._ensure_open()
        request = _request_from_args(
            query,
            max_results=max_results,
            date_range=date_range,
            locale=locale,
            include_domains=include_domains,
            exclude_domains=exclude_domains,
            content=content,
            safe_search=safe_search,
        )
        if self._bulkhead is not None and not self._bulkhead.acquire(blocking=False):
            raise ConcurrencyLimitError(self._max_concurrent_requests)
        try:
            try:
                with self._client.stream(
                    "POST",
                    self._search_url,
                    headers=self._headers,
                    json=request.model_dump(mode="json", exclude_none=True),
                    timeout=self._timeout,
                    follow_redirects=False,
                ) as response:
                    body = self._read_limited(response)
            except _BodyLimitExceeded as exc:
                raise ApiConnectionError(
                    f"Response from {self._base_url} exceeded "
                    f"max_response_bytes={self._max_response_bytes}",
                    base_url=self._base_url,
                    request_may_have_been_sent=True,
                ) from exc
            except httpx.HTTPError as exc:
                raise ApiConnectionError(
                    f"Request to {self._base_url} failed: {exc.__class__.__name__}",
                    base_url=self._base_url,
                    request_may_have_been_sent=_request_may_have_been_sent(exc),
                ) from exc
            return self._decode(response, body)
        finally:
            if self._bulkhead is not None:
                self._bulkhead.release()

    def _read_limited(self, response: httpx.Response) -> bytes:
        declared = response.headers.get("Content-Length")
        if (
            self._max_response_bytes > 0
            and declared is not None
            and declared.isdigit()
            and int(declared) > self._max_response_bytes
        ):
            raise _BodyLimitExceeded
        body = bytearray()
        for chunk in response.iter_bytes():
            if (
                self._max_response_bytes > 0
                and len(chunk) > self._max_response_bytes - len(body)
            ):
                raise _BodyLimitExceeded
            body.extend(chunk)
        return bytes(body)

    def close(self) -> None:
        if not self._closed and self._owns_http_client:
            self._client.close()
        self._closed = True

    def __enter__(self) -> Ateve:
        self._ensure_open()
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.close()


class AsyncAteve(_BaseAteve):
    """Reusable asynchronous client for high-concurrency applications."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        connect_timeout: float = DEFAULT_CONNECT_TIMEOUT,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
        max_concurrent_requests: int = 0,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            connect_timeout=connect_timeout,
            max_response_bytes=max_response_bytes,
            max_concurrent_requests=max_concurrent_requests,
        )
        self._owns_http_client = http_client is None
        self._client = http_client or httpx.AsyncClient(
            timeout=self._timeout, follow_redirects=False
        )
        self._in_flight = 0

    async def search(
        self,
        query: Union[str, SearchRequest],
        *,
        max_results: Optional[int] = None,
        date_range: Optional[str] = None,
        locale: Optional[LocaleSettings] = None,
        include_domains: Optional[list[str]] = None,
        exclude_domains: Optional[list[str]] = None,
        content: Optional[ContentOptions] = None,
        safe_search: Optional[bool] = None,
    ) -> SearchResponse:
        """Send exactly one non-blocking search request."""
        self._ensure_open()
        request = _request_from_args(
            query,
            max_results=max_results,
            date_range=date_range,
            locale=locale,
            include_domains=include_domains,
            exclude_domains=exclude_domains,
            content=content,
            safe_search=safe_search,
        )
        if (
            self._max_concurrent_requests > 0
            and self._in_flight >= self._max_concurrent_requests
        ):
            raise ConcurrencyLimitError(self._max_concurrent_requests)
        self._in_flight += 1
        try:
            try:
                async with self._client.stream(
                    "POST",
                    self._search_url,
                    headers=self._headers,
                    json=request.model_dump(mode="json", exclude_none=True),
                    timeout=self._timeout,
                    follow_redirects=False,
                ) as response:
                    body = await self._read_limited(response)
            except _BodyLimitExceeded as exc:
                raise ApiConnectionError(
                    f"Response from {self._base_url} exceeded "
                    f"max_response_bytes={self._max_response_bytes}",
                    base_url=self._base_url,
                    request_may_have_been_sent=True,
                ) from exc
            except httpx.HTTPError as exc:
                raise ApiConnectionError(
                    f"Request to {self._base_url} failed: {exc.__class__.__name__}",
                    base_url=self._base_url,
                    request_may_have_been_sent=_request_may_have_been_sent(exc),
                ) from exc
            return self._decode(response, body)
        finally:
            self._in_flight -= 1

    async def _read_limited(self, response: httpx.Response) -> bytes:
        declared = response.headers.get("Content-Length")
        if (
            self._max_response_bytes > 0
            and declared is not None
            and declared.isdigit()
            and int(declared) > self._max_response_bytes
        ):
            raise _BodyLimitExceeded
        body = bytearray()
        async for chunk in response.aiter_bytes():
            if (
                self._max_response_bytes > 0
                and len(chunk) > self._max_response_bytes - len(body)
            ):
                raise _BodyLimitExceeded
            body.extend(chunk)
        return bytes(body)

    async def aclose(self) -> None:
        if not self._closed and self._owns_http_client:
            await self._client.aclose()
        self._closed = True

    async def __aenter__(self) -> AsyncAteve:
        self._ensure_open()
        return self

    async def __aexit__(self, exc_type: object, exc: object, traceback: object) -> None:
        await self.aclose()
