from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assistant import services
from apps.assistant.serializers import (
    AskQuerySerializer,
    AssistantAnswerSerializer,
    AssistantStatusSerializer,
)
from apps.core.permissions import IsAdminOrStaff


@method_decorator(never_cache, name="dispatch")
class AskView(APIView):
    permission_classes = [IsAdminOrStaff]

    @extend_schema(parameters=[AskQuerySerializer], responses=AssistantAnswerSerializer)
    def get(self, request):
        query = AskQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        result = services.ask(query.validated_data["q"], request.user.pk)
        return Response(AssistantAnswerSerializer(result).data)


@method_decorator(never_cache, name="dispatch")
class StatusView(APIView):
    permission_classes = [IsAdminOrStaff]

    @extend_schema(responses=AssistantStatusSerializer)
    def get(self, request):
        return Response({"enabled": services.is_enabled()})
