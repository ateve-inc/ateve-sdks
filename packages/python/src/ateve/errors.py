"""Typed errors raised by the Ateve Python SDK."""

from typing import Optional


class AteveError(Exception):
    """Base class for all SDK errors."""


class ApiError(AteveError):
    """The API returned a non-success HTTP status."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        request_id: Optional[str] = None,
        code: Optional[str] = None,
        param: Optional[str] = None,
        error_type: Optional[str] = None,
        doc_url: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id
        self.code = code
        self.param = param
        self.type = error_type
        self.doc_url = doc_url

    @property
    def is_retryable(self) -> bool:
        """Whether a caller-owned policy may consider the status retryable."""
        return self.status_code == 429 or self.status_code >= 500


class InvalidRequestError(ApiError):
    """The request was rejected by validation or routing."""


class AuthenticationError(ApiError):
    """The API key was missing or invalid."""


class PaymentRequiredError(ApiError):
    """The account has insufficient credit or exceeded its credit limit."""


class ServerError(ApiError):
    """The API or its upstream search provider failed."""


class RateLimitError(ApiError):
    """A server-side rate limit was exceeded."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        request_id: Optional[str] = None,
        code: Optional[str] = None,
        param: Optional[str] = None,
        error_type: Optional[str] = None,
        doc_url: Optional[str] = None,
        retry_after_seconds: Optional[int] = None,
        limit_scope: Optional[str] = None,
    ) -> None:
        super().__init__(
            message,
            status_code=status_code,
            request_id=request_id,
            code=code,
            param=param,
            error_type=error_type,
            doc_url=doc_url,
        )
        self.retry_after_seconds = retry_after_seconds
        self.limit_scope = limit_scope


class ApiConnectionError(AteveError):
    """A DNS, connection, TLS, timeout, reset, or body-limit failure."""

    def __init__(
        self,
        message: str,
        *,
        base_url: str,
        request_may_have_been_sent: bool,
    ) -> None:
        super().__init__(message)
        self.base_url = base_url
        self.request_may_have_been_sent = request_may_have_been_sent


class ApiResponseError(AteveError):
    """A success response could not be decoded as the documented schema."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        request_id: Optional[str],
        base_url: str,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id
        self.base_url = base_url
        self.request_may_have_been_sent = True


class ConcurrencyLimitError(AteveError):
    """Rejected locally before network I/O by the optional bulkhead."""

    def __init__(self, max_concurrent_requests: int) -> None:
        super().__init__(
            "Concurrency limit reached "
            f"(max_concurrent_requests={max_concurrent_requests}); request rejected"
        )
        self.max_concurrent_requests = max_concurrent_requests
