from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api = [
    path("", include("apps.core.urls")),
    path("", include("apps.accounts.urls")),
    path("", include("apps.catalog.urls")),
    path("", include("apps.subscriptions.urls")),
    path("", include("apps.billing.urls")),
    path("", include("apps.payments.urls")),
    path("", include("apps.analytics.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [path("api/", include(api))]
if settings.ENABLE_DJANGO_ADMIN:  # off in production: one less login form to brute-force
    urlpatterns.append(path("admin/", admin.site.urls))

admin.site.site_header = "Cadence administration"
admin.site.site_title = "Cadence"
