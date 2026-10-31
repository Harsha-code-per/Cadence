from rest_framework import serializers


class AskQuerySerializer(serializers.Serializer):
    q = serializers.CharField(max_length=300, allow_blank=False)


class AssistantStatusSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()


class AssistantAnswerSerializer(serializers.Serializer):
    answer = serializers.CharField()
    tool = serializers.ChoiceField(
        choices=["summary", "aging", "revenue_series", "status_breakdown", "pipeline"],
        allow_null=True,
    )
    numbers = serializers.JSONField(allow_null=True)
