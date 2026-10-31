"""One error shape for the whole API (docs/API.md):

{"error": {"code": "...", "message": "...", "field_errors": {"field": ["..."]}}}
"""

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class DomainError(Exception):
    """Raised by services for business-rule violations. Mapped to HTTP 400 by default."""

    def __init__(self, code: str, message: str, field_errors=None, http_status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.field_errors = field_errors or {}
        self.http_status = http_status


def _flatten(detail) -> list[str]:
    if isinstance(detail, list | tuple):
        return [str(item) for item in detail]
    if isinstance(detail, dict):
        return [str(item) for value in detail.values() for item in _flatten(value)]
    return [str(detail)]


def _body(code: str, message: str, field_errors=None) -> dict:
    return {"error": {"code": code, "message": message, "field_errors": field_errors or {}}}


def exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response(_body(exc.code, exc.message, exc.field_errors), status=exc.http_status)

    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # unexpected error: let Django return 500 and log it

    if isinstance(exc, exceptions.ValidationError):
        detail = exc.detail
        if isinstance(detail, dict):
            field_errors = {k: _flatten(v) for k, v in detail.items() if k != "non_field_errors"}
            general = _flatten(detail.get("non_field_errors", []))
        else:
            field_errors, general = {}, _flatten(detail)
        message = general[0] if general else "Please fix the highlighted fields."
        response.data = _body("validation_error", message, field_errors)
        return response

    codes = {
        status.HTTP_401_UNAUTHORIZED: "not_authenticated",
        status.HTTP_403_FORBIDDEN: "permission_denied",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
        status.HTTP_429_TOO_MANY_REQUESTS: "throttled",
    }
    if isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
        response.status_code = status.HTTP_401_UNAUTHORIZED
    code = codes.get(response.status_code, "error")
    response.data = _body(code, " ".join(_flatten(getattr(exc, "detail", str(exc)))))
    return response
