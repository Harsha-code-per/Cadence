from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import (
    ChangePasswordView,
    CsrfView,
    CustomerViewSet,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetView,
    SignupView,
    StaffViewSet,
)

router = DefaultRouter()
router.register("staff", StaffViewSet, basename="staff")
router.register("customers", CustomerViewSet, basename="customer")

urlpatterns = [
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/signup/", SignupView.as_view(), name="auth-signup"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/password-reset/", PasswordResetView.as_view(), name="auth-password-reset"),
    path(
        "auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    *router.urls,
]
