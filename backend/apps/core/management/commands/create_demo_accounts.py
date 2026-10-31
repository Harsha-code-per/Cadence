"""Create the public, read-only demo logins shown on the login page and in the README.

    python manage.py create_demo_accounts

Safe to run repeatedly. These accounts are deliberately public: `is_demo` makes every API
write fail in DemoReadOnlyMiddleware, password reset skips them, and none of them can open
the Django admin. Real admin accounts are separate and keep private passwords.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Customer, Role, User

# Public by design: printed on the login page and in the README.
DEMO_PASSWORD = "Cadence@Demo2026"
INTERNAL = [
    ("demo.admin@brightloop.test", "Demo Admin", Role.ADMIN),
    ("demo.staff@brightloop.test", "Demo Staff", Role.STAFF),
]
CUSTOMER_EMAIL = "asha@raotraders.test"  # seeded customer with live subscriptions and invoices


class Command(BaseCommand):
    help = "Create or refresh the read-only demo logins."

    @transaction.atomic
    def handle(self, *args, **options):
        for email, name, role in INTERNAL:
            user = User.objects.filter(email=email).first() or User(email=email)
            user.full_name, user.role = name, role
            self._lock_down(user)

        customer_user = User.objects.filter(email=CUSTOMER_EMAIL).first()
        if customer_user and Customer.objects.filter(user=customer_user).exists():
            self._lock_down(customer_user)
        else:
            self.stderr.write(f"{CUSTOMER_EMAIL} has no customer record; run seed_demo first.")
        self.stdout.write(self.style.SUCCESS("Demo accounts ready (read-only)."))

    @staticmethod
    def _lock_down(user: User) -> None:
        user.is_demo, user.is_active = True, True
        user.is_staff, user.is_superuser = False, False  # never the Django admin
        user.set_password(DEMO_PASSWORD)
        user.save()
