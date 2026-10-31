"""Invoice API (docs/API.md § Billing / invoices).

Thin DRF views: auth, scoping, filtering and serialization only. Lifecycle rules live
in apps.billing.lifecycle. Invoice generation and the billing runner stay in
apps.billing.services (owned by the parallel billing PRs and out of scope here).
"""

from django.http import StreamingHttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.billing import lifecycle
from apps.billing.exports import invoice_csv
from apps.billing.models import Invoice, InvoiceStatus
from apps.billing.serializers import (
    InvoiceBulkConfirmResponseSerializer,
    InvoiceBulkConfirmSerializer,
    InvoiceDetailSerializer,
    InvoiceSerializer,
)
from apps.core.pagination import StandardPagination
from apps.core.permissions import CustomerScopedMixin, IsAdminOrStaff

OVERDUE_PARAM = OpenApiParameter(
    "overdue",
    bool,
    OpenApiParameter.QUERY,
    description="Only confirmed invoices past their due date.",
)


@extend_schema_view(list=extend_schema(parameters=[OVERDUE_PARAM]))
class InvoiceViewSet(
    CustomerScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """A,S see every invoice; C sees only their own rows (404 outside scope).

    Writes are lifecycle actions only (confirm / cancel / send / confirm-bulk) and are
    admin/staff only. There is deliberately no create endpoint: invoices come from the
    billing engine, never from a client payload.
    """

    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "status": ["exact"],
        "customer": ["exact"],
        "subscription": ["exact"],
        "invoice_date": ["exact", "gte", "lte"],
    }
    search_fields = ["number", "customer__name", "customer__company"]
    ordering_fields = ["invoice_date", "due_date", "total", "number", "status", "created_at"]
    customer_lookup = "customer"

    INTERNAL_ONLY_ACTIONS = frozenset({"confirm", "cancel", "send", "confirm_bulk", "export"})
    DETAIL_ACTIONS = frozenset({"retrieve", "confirm", "cancel", "send"})

    def get_permissions(self):
        if self.action in self.INTERNAL_ONLY_ACTIONS:
            return [IsAuthenticated(), IsAdminOrStaff()]
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset().select_related("customer", "subscription")
        if self.action in self.DETAIL_ACTIONS:
            queryset = queryset.prefetch_related(
                "lines__product",
                "lines__taxes",
                "payments",
            )
        overdue = self.request.query_params.get("overdue")
        if overdue and overdue.lower() in {"1", "true", "yes"}:
            queryset = queryset.filter(
                status=InvoiceStatus.CONFIRMED, due_date__lt=timezone.localdate()
            )
        return queryset

    def get_serializer_class(self):
        if self.action in self.DETAIL_ACTIONS:
            return InvoiceDetailSerializer
        return InvoiceSerializer

    @extend_schema(responses={(200, "text/csv"): str})
    @action(detail=False, methods=["get"])
    def export(self, request):
        """Download the current filtered list; streamed, so size doesn't matter."""
        rows = self.filter_queryset(self.get_queryset()).iterator(chunk_size=2000)
        response = StreamingHttpResponse(invoice_csv(rows), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="invoices.csv"'
        return response

    @extend_schema(request=None, responses=InvoiceDetailSerializer)
    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        invoice = self.get_object()
        invoice = lifecycle.confirm_invoice(invoice.pk, actor=request.user)
        return Response(self.get_serializer(invoice).data)

    @extend_schema(request=None, responses=InvoiceDetailSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        invoice = lifecycle.cancel_invoice(invoice.pk, actor=request.user)
        return Response(self.get_serializer(invoice).data)

    @extend_schema(request=None, responses=InvoiceDetailSerializer)
    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        invoice = self.get_object()
        invoice = lifecycle.send_invoice(invoice.pk, actor=request.user)
        return Response(self.get_serializer(invoice).data)

    @extend_schema(
        request=InvoiceBulkConfirmSerializer,
        responses={200: InvoiceBulkConfirmResponseSerializer},
    )
    @action(detail=False, methods=["post"], url_path="confirm-bulk")
    def confirm_bulk(self, request):
        serializer = InvoiceBulkConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        confirmed = lifecycle.confirm_invoices(serializer.validated_data["ids"], actor=request.user)
        return Response({"confirmed": confirmed}, status=status.HTTP_200_OK)
