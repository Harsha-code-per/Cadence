"""Manual billing controls and run history."""

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.billing.models import BillingRun
from apps.billing.services import run_due_billing
from apps.core.permissions import IsAdmin, IsAdminOrStaff


class BillingRunRequest(serializers.Serializer):
    date = serializers.DateField(required=False)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500, default=500)
    dry_run = serializers.BooleanField(required=False, default=False)


class BillingRunResponse(serializers.Serializer):
    activated = serializers.IntegerField()
    closed = serializers.IntegerField()
    invoiced = serializers.IntegerField()
    skipped = serializers.IntegerField()
    ran_at = serializers.DateTimeField()
    dry_run = serializers.BooleanField()


@extend_schema(request=BillingRunRequest, responses=BillingRunResponse)
@api_view(["POST"])
@permission_classes([IsAdmin])
def run_billing(request):
    params = BillingRunRequest(data=request.data)
    params.is_valid(raise_exception=True)
    data = params.validated_data
    return Response(
        run_due_billing(
            data.get("date", timezone.localdate()),
            limit=data["limit"],
            triggered_by="manual",
            dry_run=data["dry_run"],
        )
    )


@extend_schema(responses={200: dict})
@api_view(["GET"])
@permission_classes([IsAdminOrStaff])
def last_billing_run(request):
    run = BillingRun.objects.order_by("-created_at", "-id").first()
    if run is None:
        return Response({"last_run": None})
    return Response(
        {
            "last_run": {
                "run_date": run.run_date.isoformat(),
                "ran_at": run.created_at.isoformat(),
                "triggered_by": run.triggered_by,
                "activated": run.activated,
                "closed": run.closed,
                "invoiced": run.invoiced,
                "skipped": run.skipped,
            }
        }
    )
