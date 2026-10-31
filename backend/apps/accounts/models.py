from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.models import TimeStampedModel, choices_check


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    STAFF = "staff", "Internal staff"
    CUSTOMER = "customer", "Customer"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def get_by_natural_key(self, username):
        # One account per email regardless of case (matches the Lower(email) constraint).
        return self.get(email__iexact=username)

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("Email is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.update(role=Role.ADMIN, is_staff=True, is_superuser=True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(max_length=254, unique=True)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CUSTOMER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False, help_text="Can open the Django admin site.")
    is_demo = models.BooleanField(
        default=False,
        help_text="Public demo login: may read everything its role can, change nothing.",
    )
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="uq_user_email_ci"),
            choices_check("role", Role, "user_role_valid"),
        ]

    def __str__(self) -> str:
        return self.email

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_internal(self) -> bool:
        return self.role in (Role.ADMIN, Role.STAFF)


class Customer(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="customer",
    )
    name = models.CharField(max_length=150)
    company = models.CharField(max_length=200, blank=True)
    email = models.EmailField(max_length=254)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    assigned_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_customers",
    )

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(Lower("email"), name="uq_customer_email_ci")]
        indexes = [models.Index(Lower("name"), name="idx_customer_name_ci")]

    def __str__(self) -> str:
        return f"{self.name} ({self.company})" if self.company else self.name
