from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import Role


def _role(request) -> str | None:
    user = request.user
    return getattr(user, "role", None) if user and user.is_authenticated else None


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return _role(request) == Role.ADMIN


class IsAdminOrStaff(BasePermission):
    def has_permission(self, request, view):
        return _role(request) in (Role.ADMIN, Role.STAFF)


class IsAdminOrReadOnlyStaff(BasePermission):
    """Catalog rule: staff may read, only admins write. Customers get nothing."""

    def has_permission(self, request, view):
        role = _role(request)
        if role == Role.ADMIN:
            return True
        return role == Role.STAFF and request.method in SAFE_METHODS


class InternalOrCustomerReadOnly(BasePermission):
    """Admin/staff do everything the view allows; customers may only read (scoped below)."""

    def has_permission(self, request, view):
        role = _role(request)
        if role in (Role.ADMIN, Role.STAFF):
            return True
        return role == Role.CUSTOMER and request.method in SAFE_METHODS


class CustomerScopedMixin:
    """Restrict querysets to the requesting customer's own records (prevents BOLA).

    Set `customer_lookup` to the path from the model to Customer, e.g. "customer" or
    "invoice__customer". Out-of-scope objects simply don't exist for the customer (404).
    """

    customer_lookup = "customer"

    def get_queryset(self):
        qs = super().get_queryset()
        if _role(self.request) == Role.CUSTOMER:
            return qs.filter(**{f"{self.customer_lookup}__user": self.request.user})
        return qs
