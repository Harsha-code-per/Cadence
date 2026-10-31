from django.conf import settings
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from apps.accounts.models import User
from apps.core import audit
from apps.core.exceptions import DomainError


def send_password_reset_email(email: str) -> None:
    """Send a password reset link to the given email if the user exists and is active."""
    clean_email = email.strip().lower()
    user = User.objects.filter(email__iexact=clean_email, is_active=True).first()
    if not user:
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"

    subject = "Reset your Cadence password"
    message = (
        f"Hello {user.full_name},\n\n"
        f"You requested a password reset for your Cadence account.\n"
        f"Please click the link below to set a new password:\n\n"
        f"{reset_url}\n\n"
        f"This link will expire in 1 hour. If you didn't request this, you can ignore this email."
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


def change_user_password(user: User, old_password: str, new_password: str, request=None) -> None:
    if not user.check_password(old_password):
        raise DomainError(
            "invalid_password",
            "Current password is incorrect.",
            field_errors={"old_password": ["Current password is incorrect."]},
        )
    user.set_password(new_password)
    user.save(update_fields=["password"])
    if request:
        update_session_auth_hash(request, user)
    audit.record(user, "user.password_change", user)
