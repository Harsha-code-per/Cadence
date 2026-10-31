from datetime import datetime

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Customer
from apps.analytics.services import (
    get_analytics_summary,
    get_insights,
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

    def get(self, request):
        data = get_status_breakdown()
        return Response(data)


class InsightsView(APIView):
    permission_classes = [IsAdminOrStaff]

    def get(self, request):
        data = get_insights()
        return Response(data)


class PortalSummaryView(APIView):
    permission_classes = [IsAuthenticated]

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
