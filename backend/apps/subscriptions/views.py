"""Subscription API (docs/API.md § Subscriptions).

Thin DRF views: auth, scoping, validation and serialization only; rules live in
apps.subscriptions.services and apps.subscriptions.state.
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.billing.serializers import InvoiceSerializer
from apps.billing.services import generate_invoice_now
from apps.core.pagination import StandardPagination
from apps.core.permissions import CustomerScopedMixin, IsAdminOrStaff
from apps.subscriptions import services
from apps.subscriptions.models import Subscription
from apps.subscriptions.serializers import (
    SubscriptionActionSerializer,
    SubscriptionCreateSerializer,
    SubscriptionEventSerializer,
    SubscriptionFromTemplateSerializer,
    SubscriptionLineSerializer,
    SubscriptionLineWriteSerializer,
    SubscriptionSerializer,
    SubscriptionUpdateSerializer,
)

LINE_ID_PARAM = OpenApiParameter("line_id", int, OpenApiParameter.PATH)


class SubscriptionViewSet(
    CustomerScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """A,S see everything; C sees only their own rows (404 outside scope)."""

    queryset = Subscription.objects.all()
    serializer_class = SubscriptionSerializer
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "status": ["exact"],
        "customer": ["exact"],
        "plan": ["exact"],
        "next_invoice_date": ["exact", "gte", "lte"],
    }
    search_fields = ["number", "customer__name", "customer__company"]
    ordering_fields = ["created_at", "start_date", "next_invoice_date", "number", "status"]
    customer_lookup = "customer"

    # Writes are admin/staff only; the customer portal only ever POSTs lifecycle actions,
    # and services.perform_action allow-lists confirm/pause/close/renew for customers.
    INTERNAL_ONLY_ACTIONS = {
        "create",
        "from_template",
        "partial_update",
        "line_detail",
        "invoice_now",
    }

    def get_permissions(self):
        if self.action in self.INTERNAL_ONLY_ACTIONS or (
            self.action == "lines" and self.request.method == "POST"
        ):
            return [IsAuthenticated(), IsAdminOrStaff()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related(
                "customer",
                "plan",
                "payment_term",
                "discount",
                "quotation_template",
                "salesperson",
            )
            .prefetch_related(
                "lines__product",
                "lines__variant__product",
                "lines__variant__values__attribute",
                "lines__taxes",
            )
        )

    @extend_schema(request=SubscriptionCreateSerializer, responses={201: SubscriptionSerializer})
    def create(self, request):
        serializer = SubscriptionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscription = services.create_subscription(actor=request.user, **serializer.validated_data)
        return Response(self.get_serializer(subscription).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=SubscriptionUpdateSerializer, responses=SubscriptionSerializer)
    def partial_update(self, request, pk=None):
        subscription = self.get_object()
        serializer = SubscriptionUpdateSerializer(
            instance=subscription, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        subscription = services.update_subscription(
            subscription.pk, actor=request.user, data=serializer.validated_data
        )
        return Response(self.get_serializer(subscription).data)

    @extend_schema(
        request=SubscriptionFromTemplateSerializer,
        responses={201: SubscriptionSerializer},
    )
    @action(detail=False, methods=["post"], url_path="from-template")
    def from_template(self, request):
        serializer = SubscriptionFromTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscription = services.create_from_template(
            actor=request.user, **serializer.validated_data
        )
        return Response(self.get_serializer(subscription).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses=SubscriptionEventSerializer(many=True))
    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        subscription = self.get_object()
        queryset = subscription.events.select_related("actor").order_by("created_at", "id")
        page = self.paginate_queryset(queryset)
        serializer = SubscriptionEventSerializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @extend_schema(methods=["GET"], responses=SubscriptionLineSerializer(many=True))
    @extend_schema(
        methods=["POST"],
        request=SubscriptionLineWriteSerializer,
        responses={201: SubscriptionLineSerializer},
    )
    @action(detail=True, methods=["get", "post"], url_path="lines")
    def lines(self, request, pk=None):
        subscription = self.get_object()
        if request.method == "POST":
            serializer = SubscriptionLineWriteSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            line = services.add_line(
                subscription.pk, actor=request.user, data=serializer.validated_data
            )
            return Response(SubscriptionLineSerializer(line).data, status=status.HTTP_201_CREATED)
        queryset = subscription.lines.select_related("product", "variant").prefetch_related(
            "taxes", "variant__values__attribute"
        )
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(SubscriptionLineSerializer(page, many=True).data)

    @extend_schema(
        methods=["PATCH"],
        request=SubscriptionLineWriteSerializer,
        responses=SubscriptionLineSerializer,
        parameters=[LINE_ID_PARAM],
    )
    @extend_schema(methods=["DELETE"], responses={204: None}, parameters=[LINE_ID_PARAM])
    @action(detail=True, methods=["patch", "delete"], url_path=r"lines/(?P<line_id>\d+)")
    def line_detail(self, request, pk=None, line_id=None):
        subscription = self.get_object()
        if request.method == "DELETE":
            services.remove_line(subscription.pk, line_id, actor=request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)
        line = get_object_or_404(subscription.lines, pk=line_id)
        serializer = SubscriptionLineWriteSerializer(instance=line, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        line = services.update_line(
            subscription.pk, line_id, actor=request.user, data=serializer.validated_data
        )
        return Response(SubscriptionLineSerializer(line).data)

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        return self._run_action(request, "send")

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def revise(self, request, pk=None):
        return self._run_action(request, "revise")

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        return self._run_action(request, "confirm")

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        return self._run_action(request, "activate")

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        return self._run_action(request, "pause")

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        return self._run_action(request, "resume")

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        return self._run_action(request, "close")

    @extend_schema(request=SubscriptionActionSerializer, responses=SubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def renew(self, request, pk=None):
        return self._run_action(request, "renew")

    @extend_schema(request=None, responses={201: InvoiceSerializer})
    @action(detail=True, methods=["post"], url_path="invoice-now")
    def invoice_now(self, request, pk=None):
        """Bill the period that is due today, through the normal billing engine."""
        subscription = self.get_object()
        invoice = generate_invoice_now(subscription.pk, timezone.localdate())
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    def _run_action(self, request, action_name: str):
        subscription = self.get_object()
        body = SubscriptionActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        # `reason` is the UI's name for a closure note; the state machine stores it on the event.
        note = body.validated_data.get("note") or body.validated_data.get("reason") or ""
        result = services.perform_action(
            subscription.pk, action_name, actor=request.user, note=note
        )
        # Renewal returns the new subscription; other actions return the updated one.
        return Response(self.get_serializer(result).data)
