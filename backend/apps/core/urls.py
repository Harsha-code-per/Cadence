from django.urls import path

from apps.core import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("public/stats/", views.public_stats, name="public-stats"),
    path("internal/billing/run/", views.internal_billing_run, name="internal-billing-run"),
]
