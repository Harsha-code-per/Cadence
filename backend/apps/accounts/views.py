from django.contrib.auth import authenticate, login, logout
from django.core.cache import cache
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import filters, status, viewsets
from rest_framework import serializers as drf_serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Customer, Role, User
from apps.accounts.serializers import (
    ChangePasswordSerializer,
    CustomerSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    StaffCreateSerializer,
    StaffUpdateSerializer,
    UserSerializer,
)
from apps.accounts.services import change_user_password, send_password_reset_email
from apps.core import audit
from apps.core.exceptions import DomainError
from apps.core.permissions import InternalOrCustomerReadOnly, IsAdmin

# Per-account lockout: the IP throttle alone can be dodged with spoofed proxy headers.
# ponytail: per-process cache (2 workers ⇒ up to 2× attempts); move to a shared cache if scaled.
MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 15 * 60


def _lockout_key(email: str) -> str:
    return f"login-failures:{email}"


# DRF exempts views from CSRF; anonymous auth endpoints opt back in (stops login CSRF).
csrf_protected = method_decorator(csrf_protect, name="dispatch")


class CsrfView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="CsrfResponse",
                fields={
                    "status": drf_serializers.CharField(),
                    "csrf_token": drf_serializers.CharField(),
                },
            )
        }
    )
    def get(self, request):
        token = get_token(request)
        return Response({"status": "ok", "csrf_token": token})


@csrf_protected
class SignupView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=SignupSerializer, responses={201: UserSerializer})
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        audit.record(user, "user.signup", user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@csrf_protected
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=LoginSerializer, responses={200: UserSerializer})
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        password = serializer.validated_data["password"]
        key = _lockout_key(email)
        if cache.get(key, 0) >= MAX_FAILED_LOGINS:
            raise DomainError(
                "too_many_attempts",
                "Too many failed attempts. Try again in 15 minutes, or reset your password.",
                http_status=429,
            )

        user = authenticate(request, username=email, password=password)
        if user is None:
            cache.set(key, cache.get(key, 0) + 1, LOCKOUT_SECONDS)
            candidate = User.objects.filter(email__iexact=email).first()
            if candidate and candidate.check_password(password) and not candidate.is_active:
                raise DomainError(
                    "account_inactive", "This account has been deactivated.", http_status=403
                )
            raise DomainError("invalid_credentials", "Invalid email or password.", http_status=400)

        if not user.is_active:
            raise DomainError(
                "account_inactive", "This account has been deactivated.", http_status=403
            )

        cache.delete(key)
        login(request, user)
        audit.record(user, "user.login", user)
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None, responses={204: OpenApiResponse(description="Logged out successfully")}
    )
    def post(self, request):
        audit.record(request.user, "user.logout", request.user)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: UserSerializer})
    def get(self, request):
        return Response(UserSerializer(request.user).data)


@csrf_protected
class PasswordResetView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={204: OpenApiResponse(description="Reset link sent if user exists")},
    )
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        send_password_reset_email(serializer.validated_data["email"])
        # Always 204 to prevent user enumeration
        return Response(status=status.HTTP_204_NO_CONTENT)


@csrf_protected
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        responses={204: OpenApiResponse(description="Password reset confirmed")},
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={204: OpenApiResponse(description="Password changed successfully")},
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        change_user_password(
            request.user,
            old_password=serializer.validated_data["old_password"],
            new_password=serializer.validated_data["new_password"],
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    queryset = User.objects.filter(role__in=[Role.ADMIN, Role.STAFF]).order_by("-date_joined")
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["email", "full_name"]
    ordering_fields = ["date_joined", "full_name", "role"]

    def get_serializer_class(self):
        if self.action == "create":
            return StaffCreateSerializer
        if self.action in ("update", "partial_update"):
            return StaffUpdateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        audit.record(
            self.request.user, "staff.create", user, {"email": user.email, "role": user.role}
        )

    def perform_update(self, serializer):
        demoting = serializer.validated_data.get("role", Role.ADMIN) != Role.ADMIN
        deactivating = serializer.validated_data.get("is_active") is False
        if serializer.instance == self.request.user and (demoting or deactivating):
            raise DomainError(
                "cannot_modify_self",
                "You can't remove your own admin access or deactivate yourself.",
            )
        user = serializer.save()
        audit.record(
            self.request.user,
            "staff.update",
            user,
            {"role": user.role, "is_active": user.is_active},
        )

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise DomainError("cannot_modify_self", "You can't deactivate your own account.")
        # Soft deactivate instead of hard delete
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        audit.record(self.request.user, "staff.deactivate", instance)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [InternalOrCustomerReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "company", "email", "phone"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        user = self.request.user
        qs = Customer.objects.select_related("assigned_staff").all()
        if user.is_authenticated and getattr(user, "role", None) == Role.CUSTOMER:
            return qs.filter(user=user)
        return qs

    def perform_create(self, serializer):
        customer = serializer.save()
        audit.record(self.request.user, "customer.create", customer)

    def perform_update(self, serializer):
        customer = serializer.save()
        audit.record(self.request.user, "customer.update", customer)
