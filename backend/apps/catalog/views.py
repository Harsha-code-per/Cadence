from django.db.models import Count, Prefetch
from rest_framework.viewsets import ModelViewSet

from apps.core.permissions import IsAdminOrReadOnlyStaff

from .filters import PlanFilter
from .models import (
    Attribute,
    AttributeValue,
    Discount,
    PaymentTerm,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    Tax,
)
from .serializers import (
    AttributeSerializer,
    DiscountSerializer,
    PaymentTermSerializer,
    PlanSerializer,
    ProductSerializer,
    QuotationTemplateSerializer,
    TaxSerializer,
    VariantSerializer,
)


class CatalogViewSet(ModelViewSet):
    permission_classes = (IsAdminOrReadOnlyStaff,)
    search_fields = ("name",)
    ordering_fields = ("id", "name", "created_at", "updated_at")


class ProductViewSet(CatalogViewSet):
    queryset = Product.objects.prefetch_related(
        "taxes",
        Prefetch(
            "variants",
            queryset=ProductVariant.objects.select_related("product").prefetch_related(
                Prefetch("values", queryset=AttributeValue.objects.select_related("attribute"))
            ),
        ),
    )
    serializer_class = ProductSerializer
    filterset_fields = ("product_type", "is_active")
    search_fields = ("name", "notes", "variants__sku")
    ordering_fields = (*CatalogViewSet.ordering_fields, "sales_price", "cost_price")


class VariantViewSet(CatalogViewSet):
    queryset = ProductVariant.objects.select_related("product").prefetch_related(
        Prefetch("values", queryset=AttributeValue.objects.select_related("attribute"))
    )
    serializer_class = VariantSerializer
    filterset_fields = ("product",)
    search_fields = ("sku", "product__name", "values__name")
    ordering_fields = ("id", "sku", "product", "created_at")


class AttributeViewSet(CatalogViewSet):
    queryset = Attribute.objects.prefetch_related("values")
    serializer_class = AttributeSerializer
    filterset_fields = ("name",)


class TaxViewSet(CatalogViewSet):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    filterset_fields = ("is_active",)
    ordering_fields = (*CatalogViewSet.ordering_fields, "rate")


class PaymentTermViewSet(CatalogViewSet):
    queryset = PaymentTerm.objects.all()
    serializer_class = PaymentTermSerializer
    filterset_fields = ("due_days",)
    ordering_fields = (*CatalogViewSet.ordering_fields, "due_days")


class PlanViewSet(CatalogViewSet):
    queryset = Plan.objects.prefetch_related("taxes")
    serializer_class = PlanSerializer
    filterset_class = PlanFilter
    ordering_fields = (*CatalogViewSet.ordering_fields, "price", "start_date", "end_date")


class DiscountViewSet(CatalogViewSet):
    queryset = Discount.objects.annotate(
        times_used=Count("redemptions", distinct=True)
    ).prefetch_related("products")
    serializer_class = DiscountSerializer
    ordering = ("-start_date", "name", "id")
    filterset_fields = ("is_active", "discount_type", "scope")
    search_fields = ("name", "code")
    ordering_fields = (
        *CatalogViewSet.ordering_fields,
        "start_date",
        "end_date",
        "value",
        "times_used",
    )


class QuotationTemplateViewSet(CatalogViewSet):
    queryset = QuotationTemplate.objects.select_related("plan", "payment_term").prefetch_related(
        "lines"
    )
    serializer_class = QuotationTemplateSerializer
    filterset_fields = ("plan", "payment_term")
