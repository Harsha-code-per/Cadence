from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework import filters, status, viewsets
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


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = get_token(request)
        return Response({"status": "ok", "csrf_token": token})


class SignupView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        audit.record(user, "user.signup", user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        password = serializer.validated_data["password"]

        user = authenticate(request, username=email, password=password)
        if user is None:
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

        login(request, user)
        audit.record(user, "user.login", user)
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        audit.record(request.user, "user.logout", request.user)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class PasswordResetView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        send_password_reset_email(serializer.validated_data["email"])
        # Always 204 to prevent user enumeration
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

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
        user = serializer.save()
        audit.record(
            self.request.user,
            "staff.update",
            user,
            {"role": user.role, "is_active": user.is_active},
        )

    def perform_destroy(self, instance):
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
