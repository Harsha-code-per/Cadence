import re

from django.core.exceptions import ValidationError

SPECIAL = re.compile(r"[^A-Za-z0-9]")


class CadencePasswordValidator:
    """Brief: more than eight characters, an uppercase, a lowercase and a special character."""

    def validate(self, password, user=None):
        errors = []
        if len(password) <= 8:
            errors.append("Must be more than 8 characters.")
        if not re.search(r"[A-Z]", password):
            errors.append("Add an uppercase letter.")
        if not re.search(r"[a-z]", password):
            errors.append("Add a lowercase letter.")
        if not SPECIAL.search(password):
            errors.append("Add a special character.")
        if errors:
            raise ValidationError(errors, code="password_policy")

    def get_help_text(self):
        return (
            "More than 8 characters, with an uppercase letter, a lowercase letter "
            "and a special character."
        )
