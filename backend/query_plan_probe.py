import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django

django.setup()

from datetime import date

from django.db import connection, transaction
from django.db.models import F, Q

from apps.billing.models import Invoice
from apps.subscriptions.models import Subscription

today = date.today()
with connection.cursor() as cursor:
    cursor.execute("ANALYZE")
print("ROW COUNTS", Subscription.objects.count(), Invoice.objects.count(), flush=True)
due = Q(status="active", next_invoice_date__lte=today) & (
    Q(expiration_date__isnull=True) | Q(next_invoice_date__lte=F("expiration_date"))
)
activate = Q(status="confirmed", start_date__lte=today) & (
    Q(expiration_date__isnull=True) | Q(expiration_date__gte=today)
)
expire = Q(status__in=["active", "paused"], plan__auto_close=True, expiration_date__lt=today)
queries = {
    "billing runner": Subscription.objects.filter(due | activate | expire)
    .order_by("pk")
    .select_for_update(skip_locked=True, of=("self",))[:500],
    "due active": Subscription.objects.filter(due),
    "overdue invoices": Invoice.objects.filter(status="confirmed", due_date__lt=today),
    "subscription search": Subscription.objects.filter(
        Q(number__icontains="SUB/2026/00001")
        | Q(customer__name__icontains="SUB/2026/00001")
        | Q(customer__company__icontains="SUB/2026/00001")
    )[:20],
}
for name, query in queries.items():
    print("QUERY PLAN:", name, flush=True)
    with transaction.atomic():
        print(query.explain(analyze=True, buffers=True), flush=True)
