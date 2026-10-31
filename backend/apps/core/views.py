import hmac
from datetime import date

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Q, Sum
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.models import Invoice, InvoiceStatus
from apps.billing.services import run_due_billing
from apps.core.exceptions import DomainError
from apps.payments.models import Payment
from apps.subscriptions.models import Subscription, SubscriptionStatus


@extend_schema(
    responses=inline_serializer(
        "Health", {"status": serializers.CharField(), "db": serializers.CharField()}
    )
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return Response({"status": "ok", "db": "ok"})


@extend_schema(
    responses=inline_serializer(
        "PublicStats",
        {
            "active_subscriptions": serializers.IntegerField(),
            "invoices_issued": serializers.IntegerField(),
            "revenue_collected": serializers.DecimalField(max_digits=14, decimal_places=2),
        },
    )
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_stats(request):
    """Aggregate-only numbers for the landing page's live band (no personal data)."""
    data = cache.get("public_stats")
    if data is None:
        data = {
            "active_subscriptions": Subscription.objects.filter(
                status=SubscriptionStatus.ACTIVE
            ).count(),
            "invoices_issued": Invoice.objects.aggregate(
                n=Count("id", filter=Q(status__in=[InvoiceStatus.CONFIRMED, InvoiceStatus.PAID]))
            )["n"],
            "revenue_collected": Payment.objects.aggregate(s=Sum("amount"))["s"] or 0,
        }
        cache.set("public_stats", data, 60)
    return Response(data)


@extend_schema(request=None, responses={200: dict})
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def internal_billing_run(request):
    """Scheduler entry point (GitHub Actions cron). Bearer secret, constant-time compare."""
    expected = settings.SCHEDULER_SECRET
    supplied = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise DomainError("permission_denied", "Invalid scheduler credentials.", http_status=403)
    return Response(run_due_billing(date.today(), triggered_by="scheduler"))


def csrf_failure(request, reason=""):
    """CSRF rejections in the API's error shape, so the UI can show a useful message."""
    from django.http import JsonResponse

    return JsonResponse(
        {
            "error": {
                "code": "csrf_failed",
                "message": "Your security token expired. Refresh the page and try again.",
                "field_errors": {},
            }
        },
        status=403,
    )
