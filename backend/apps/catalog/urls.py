from rest_framework.routers import SimpleRouter

from .views import (
    AttributeViewSet,
    DiscountViewSet,
    PaymentTermViewSet,
    PlanViewSet,
    ProductViewSet,
    QuotationTemplateViewSet,
    TaxViewSet,
    VariantViewSet,
)

router = SimpleRouter()
router.register("products", ProductViewSet, basename="product")
router.register("variants", VariantViewSet, basename="variant")
router.register("attributes", AttributeViewSet, basename="attribute")
router.register("taxes", TaxViewSet, basename="tax")
router.register("payment-terms", PaymentTermViewSet, basename="payment-term")
router.register("plans", PlanViewSet, basename="plan")
router.register("discounts", DiscountViewSet, basename="discount")
router.register("quotation-templates", QuotationTemplateViewSet, basename="quotation-template")

urlpatterns = [*router.urls]
