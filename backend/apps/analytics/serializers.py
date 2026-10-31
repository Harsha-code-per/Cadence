from rest_framework import serializers


class AnalyticsSummarySerializer(serializers.Serializer):
    active_subscriptions = serializers.IntegerField()
    mrr = serializers.CharField()
    arr = serializers.CharField()
    invoiced = serializers.CharField()
    collected = serializers.CharField()
    outstanding = serializers.CharField()
    overdue_count = serializers.IntegerField()
    overdue_amount = serializers.CharField()


class RevenueSeriesSerializer(serializers.Serializer):
    month = serializers.CharField()
    invoiced = serializers.CharField()
    collected = serializers.CharField()


class StatusBreakdownSerializer(serializers.Serializer):
    subscriptions = serializers.DictField(child=serializers.IntegerField())
    invoices = serializers.DictField(child=serializers.IntegerField())


class InsightItemSerializer(serializers.Serializer):
    subscription_id = serializers.IntegerField()
    number = serializers.CharField()
    customer_name = serializers.CharField()
    plan_name = serializers.CharField()
    risk_score = serializers.IntegerField()
    reasons = serializers.ListField(child=serializers.CharField())


class PortalSummarySerializer(serializers.Serializer):
    customer = serializers.DictField()
    active_subscriptions = serializers.IntegerField()
    next_invoice_date = serializers.CharField(allow_null=True)
    outstanding = serializers.CharField()
    recent_invoices = serializers.ListField(child=serializers.DictField())
    recent_payments = serializers.ListField(child=serializers.DictField())


class AgingBucketSerializer(serializers.Serializer):
    bucket = serializers.CharField()
    count = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
