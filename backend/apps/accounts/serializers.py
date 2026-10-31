from django.contrib.auth import password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from apps.accounts.models import Customer, Role, User
from apps.core.exceptions import DomainError


class UserSerializer(serializers.ModelSerializer):
    customer_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "is_active", "date_joined", "customer_id"]
        read_only_fields = ["id", "is_active", "date_joined", "customer_id"]

    def get_customer_id(self, obj: User) -> int | None:
        customer = getattr(obj, "customer", None)
        return customer.id if customer else None


class SignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    company = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        clean = value.strip().lower()
        if User.objects.filter(email__iexact=clean).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return clean

    def validate_password(self, value: str) -> str:
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    @transaction.atomic
    def create(self, validated_data) -> User:
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            full_name=validated_data["full_name"],
            role=Role.CUSTOMER,
        )
        Customer.objects.create(
            user=user,
            name=user.full_name,
            email=user.email,
            company=validated_data.get("company", ""),
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value: str) -> str:
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def save(self) -> None:
        try:
            uid_int = force_str(urlsafe_base64_decode(self.validated_data["uid"]))
            user = User.objects.get(pk=uid_int)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise DomainError(
                "invalid_token", "This link has expired. Request a new one.", http_status=400
            ) from None

        if not default_token_generator.check_token(user, self.validated_data["token"]):
            raise DomainError(
                "invalid_token", "This link has expired. Request a new one.", http_status=400
            )

        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value: str) -> str:
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class StaffCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=[Role.ADMIN, Role.STAFF], default=Role.STAFF)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "password", "is_active", "date_joined"]
        read_only_fields = ["id", "date_joined"]

    def validate_email(self, value: str) -> str:
        clean = value.strip().lower()
        if User.objects.filter(email__iexact=clean).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return clean

    def validate_password(self, value: str) -> str:
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        role = validated_data["role"]
        is_staff = role == Role.ADMIN
        return User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            full_name=validated_data["full_name"],
            role=role,
            is_staff=is_staff,
        )


class StaffUpdateSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=[Role.ADMIN, Role.STAFF], required=False)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "is_active"]
        read_only_fields = ["id", "email"]


class CustomerSerializer(serializers.ModelSerializer):
    assigned_staff_name = serializers.CharField(source="assigned_staff.full_name", read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "user",
            "name",
            "company",
            "email",
            "phone",
            "address",
            "assigned_staff",
            "assigned_staff_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_email(self, value: str) -> str:
        clean = value.strip().lower()
        qs = Customer.objects.filter(email__iexact=clean)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A customer with this email already exists.")
        return clean
