import django_filters
from rest_framework import filters, mixins, status, viewsets
from rest_framework.response import Response

from apps.core.permissions import CustomerScopedMixin, InternalOrCustomerReadOnly, IsAdminOrStaff
from apps.payments.models import Payment
from apps.payments.serializers import PaymentCreateSerializer, PaymentSerializer


class PaymentFilter(django_filters.FilterSet):
    customer = django_filters.NumberFilter(field_name="invoice__customer_id")
    payment_date__gte = django_filters.DateFilter(field_name="payment_date", lookup_expr="gte")
    payment_date__lte = django_filters.DateFilter(field_name="payment_date", lookup_expr="lte")

    class Meta:
        model = Payment
        fields = ["invoice", "method", "customer", "payment_date__gte", "payment_date__lte"]


class PaymentViewSet(
    CustomerScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Payments are an append-only ledger: editing or deleting one would desync
    invoice.amount_paid, so only list, retrieve and create are exposed."""

    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    customer_lookup = "invoice__customer"
    filter_backends = [
        django_filters.rest_framework.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = PaymentFilter
    search_fields = ["number", "reference", "invoice__number", "invoice__customer__name"]
    ordering_fields = ["payment_date", "created_at", "amount"]
    ordering = ["-payment_date", "-id"]

    def get_permissions(self):
        if self.action == "create":
            return [IsAdminOrStaff()]
        return [InternalOrCustomerReadOnly()]

    def get_queryset(self):
        return super().get_queryset().select_related("invoice", "invoice__customer", "recorded_by")

    def create(self, request, *args, **kwargs):
        serializer = PaymentCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
