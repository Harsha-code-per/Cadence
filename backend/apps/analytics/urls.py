from django.urls import path

from apps.analytics.views import (
    AgingView,
    InsightsView,
    PipelineView,
    PortalSummaryView,
    RevenueSeriesView,
    StatusBreakdownView,
    SummaryView,
)

urlpatterns = [
    path("analytics/summary/", SummaryView.as_view(), name="analytics-summary"),
    path("analytics/revenue-series/", RevenueSeriesView.as_view(), name="analytics-revenue-series"),
    path(
        "analytics/status-breakdown/",
        StatusBreakdownView.as_view(),
        name="analytics-status-breakdown",
    ),
    path("analytics/aging/", AgingView.as_view(), name="analytics-aging"),
    path("analytics/insights/", InsightsView.as_view(), name="analytics-insights"),
    path("analytics/pipeline/", PipelineView.as_view(), name="analytics-pipeline"),
    path("portal/summary/", PortalSummaryView.as_view(), name="portal-summary"),
]
