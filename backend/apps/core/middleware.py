"""Server-Timing header on every API response: live proof of the brief's < 2 s rule.

    Server-Timing: db;dur=4.2;desc="3 queries", app;dur=11.8

Browsers expose it to same-origin JS (PerformanceResourceTiming.serverTiming), so the
frontend can show a small "11 ms · 3 queries" badge without any extra endpoint.
"""

import time

from django.db import connection


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
