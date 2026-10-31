from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.billing import run_views
from apps.billing.views import InvoiceViewSet

router = SimpleRouter()
router.register("invoices", InvoiceViewSet, basename="invoice")

urlpatterns = [
    path("billing/run/", run_views.run_billing, name="billing-run"),
    path("billing/last-run/", run_views.last_billing_run, name="billing-last-run"),
    *router.urls,
]
