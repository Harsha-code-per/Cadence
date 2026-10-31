from django.db.models import Q, QuerySet
from django.utils import timezone
from django_filters import rest_framework as filters

from .models import Plan


class PlanFilter(filters.FilterSet):
    available = filters.BooleanFilter(method="filter_available")

    class Meta:
        model = Plan
        fields = ("is_active", "billing_period", "closable", "pausable", "renewable")

    def filter_available(self, queryset: QuerySet, name: str, value: bool) -> QuerySet:
        today = timezone.localdate()
        available = Q(is_active=True, start_date__lte=today) & (
            Q(end_date__isnull=True) | Q(end_date__gte=today)
        )
        return queryset.filter(available if value else ~available)
