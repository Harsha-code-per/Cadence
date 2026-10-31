from datetime import datetime
from decimal import Decimal

from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Customer
from apps.analytics.serializers import (
    AgingBucketSerializer,
    AnalyticsSummarySerializer,
    InsightItemSerializer,
    PortalSummarySerializer,
    RevenueSeriesSerializer,
    StatusBreakdownSerializer,
)
from apps.analytics.services import (
    get_aging,
    get_analytics_summary,
    get_insights,
    get_pipeline,
    get_portal_summary,
    get_revenue_series,
    get_status_breakdown,
)
from apps.core.exceptions import DomainError
from apps.core.permissions import IsAdminOrStaff


def _parse_date(val: str | None):
    if not val:
        return None
    try:
        return datetime.strptime(val, "%Y-%m-%d").date()
    except ValueError:
        return None


class SummaryView(APIView):
    permission_classes = [IsAdminOrStaff]

    @extend_schema(
        parameters=[
            OpenApiParameter("from", type=str, description="From date YYYY-MM-DD", required=False),
            OpenApiParameter("to", type=str, description="To date YYYY-MM-DD", required=False),
            OpenApiParameter("plan", type=int, description="Filter by plan ID", required=False),
        ],
        responses={200: AnalyticsSummarySerializer},
    )
    def get(self, request):
        from_date = _parse_date(request.query_params.get("from"))
        to_date = _parse_date(request.query_params.get("to"))
        plan_id = request.query_params.get("plan")
        try:
            plan_id = int(plan_id) if plan_id else None
        except (ValueError, TypeError):
            plan_id = None

        data = get_analytics_summary(from_date=from_date, to_date=to_date, plan_id=plan_id)
        return Response(data)


class RevenueSeriesView(APIView):
    permission_classes = [IsAdminOrStaff]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "months", type=int, description="Number of past months (default 12)", required=False
            ),
        ],
        responses={200: RevenueSeriesSerializer(many=True)},
    )
    def get(self, request):
        months_param = request.query_params.get("months", "12")
        try:
            months = int(months_param)
        except (ValueError, TypeError):
            months = 12

        data = get_revenue_series(months=months)
        return Response(data)


class StatusBreakdownView(APIView):
    permission_classes = [IsAdminOrStaff]

    @extend_schema(responses={200: StatusBreakdownSerializer})
    def get(self, request):
        data = get_status_breakdown()
        return Response(data)


class AgingView(APIView):
    permission_classes = [IsAdminOrStaff]

    @extend_schema(responses={200: AgingBucketSerializer(many=True)})
    def get(self, request):
        return Response(get_aging())


class InsightsView(APIView):
    permission_classes = [IsAdminOrStaff]

    @extend_schema(responses={200: InsightItemSerializer(many=True)})
    def get(self, request):
        data = get_insights()
        return Response(data)


class PortalSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PortalSummarySerializer})
    def get(self, request):
        user = request.user
        customer = getattr(user, "customer", None)
        if not customer:
            # Fallback check if user email matches an unlinked customer
            customer = Customer.objects.filter(email__iexact=user.email).first()
        if not customer:
            raise DomainError(
                "not_found", "No customer profile found for this account.", http_status=404
            )

        data = get_portal_summary(customer)
        return Response(data)


class PipelineView(APIView):
    """Kanban column totals: count and recurring value per subscription stage."""

    permission_classes = [IsAdminOrStaff]

    @extend_schema(
        responses=inline_serializer(
            "PipelineStage",
            {
                "status": serializers.CharField(),
                "count": serializers.IntegerField(),
                "recurring_value": serializers.DecimalField(max_digits=14, decimal_places=2),
            },
            many=True,
        )
    )
    def get(self, request):
        data = get_pipeline()
        for row in data:
            row["recurring_value"] = str(row["recurring_value"].quantize(Decimal("0.01")))
        return Response(data)
