from django.urls import path

from apps.assistant.views import AskView, StatusView

urlpatterns = [
    path("assistant/ask/", AskView.as_view(), name="assistant-ask"),
    path("assistant/status/", StatusView.as_view(), name="assistant-status"),
]
