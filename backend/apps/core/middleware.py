"""Server-Timing header on every API response: live proof of the brief's < 2 s rule.

    Server-Timing: db;dur=4.2;desc="3 queries", app;dur=11.8

Browsers expose it to same-origin JS (PerformanceResourceTiming.serverTiming), so the
frontend can show a small "11 ms · 3 queries" badge without any extra endpoint.
"""

import json
import time

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse


class ServerTimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        stats = {"count": 0, "seconds": 0.0}

        def track(execute, sql, params, many, context):
            start = time.perf_counter()
            try:
                return execute(sql, params, many, context)
            finally:
                stats["count"] += 1
                stats["seconds"] += time.perf_counter() - start

        started = time.perf_counter()
        with connection.execute_wrapper(track):
            response = self.get_response(request)
        total_ms = (time.perf_counter() - started) * 1000
        response["Server-Timing"] = (
            f'db;dur={stats["seconds"] * 1000:.1f};desc="{stats["count"]} queries", '
            f"app;dur={total_ms:.1f}"
        )
        return response


class DemoReadOnlyMiddleware:
    """Public demo logins can look at everything their role can and change nothing.

    One chokepoint on purpose: every write to the API passes here, so an endpoint added
    later is read-only for demo users without anyone remembering to protect it.
    """

    ALWAYS_ALLOWED = {"/api/auth/login/", "/api/auth/logout/"}
    DRY_RUN_PATH = "/api/billing/run/"
    DRY_RUN_COOLDOWN_SECONDS = 30

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            request.method not in ("GET", "HEAD", "OPTIONS")
            and request.path.startswith("/api/")
            and request.path not in self.ALWAYS_ALLOWED
            and getattr(request.user, "is_demo", False)
        ):
            return self._refuse_or_allow_preview(request)
        return self.get_response(request)

    def _refuse_or_allow_preview(self, request):
        if request.path == self.DRY_RUN_PATH and self._is_dry_run(request):
            # A preview rolls back, so it changes nothing, but it is heavy: rate-limit it.
            if cache.add("demo-dry-run", 1, self.DRY_RUN_COOLDOWN_SECONDS):
                return self.get_response(request)
            return _error(
                "demo_rate_limited", "Previews run once every 30 seconds in the demo.", 429
            )
        return _error(
            "demo_read_only",
            "This is a read-only demo account, so nothing was changed. Create your own "
            "account to try saving changes.",
            403,
        )

    @staticmethod
    def _is_dry_run(request) -> bool:
        try:
            return json.loads(request.body).get("dry_run") is True
        except (ValueError, AttributeError):
            return False


def _error(code: str, message: str, status: int) -> JsonResponse:
    body = {"error": {"code": code, "message": message, "field_errors": {}}}
    return JsonResponse(body, status=status)
