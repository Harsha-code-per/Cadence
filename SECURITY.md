# Security Policy

## Reporting a vulnerability
Please **do not open a public issue**. Use GitHub's private vulnerability reporting (Security → Report a vulnerability) or contact the maintainer [@Harsha-code-per](https://github.com/Harsha-code-per). We'll acknowledge within 48 hours.

## Supported versions
Only `main` is supported.

## Security controls in Cadence
| Area | Control |
|---|---|
| Passwords | Argon2 hashing; policy: more than 8 characters with uppercase, lowercase and a special character; Django's common-password and similarity validators |
| Accounts | One account per email (case-insensitive unique constraint); only admins create staff accounts |
| Sessions | httpOnly, Secure (prod), SameSite=Lax session cookie; CSRF token on every unsafe request; session rotated on login; invalidated on logout and password change |
| Password reset | Single-use, time-limited token (Django `PasswordResetTokenGenerator`, 1 h); the response is identical whether or not the email exists |
| Brute force | DRF scoped throttles on login, signup and password reset, plus a **per-account lockout** (5 failures → 15 min) that can't be dodged with spoofed proxy headers |
| Login CSRF | Login, signup and reset endpoints enforce Django CSRF even for anonymous users, so a malicious site can't log a victim into another account |
| Account claiming | Signup never links an existing (staff-created) customer record. The owner claims it via “Forgot password”: receiving the email proves ownership. `Customer.user` is read-only in the API |
| Admin safety | Admins can't demote or deactivate themselves; the Django admin site is off in production (`ENABLE_DJANGO_ADMIN`) |
| Public demo logins | `User.is_demo` accounts are read-only: `DemoReadOnlyMiddleware` refuses every API write in one place (a test walks the URL table so new endpoints stay covered). Only login, logout and a rate-limited billing dry run pass. No password reset, no lockout (strangers can't shut judges out), no Django admin |
| Authorization | Role checks on every endpoint (admin / staff / customer); customer data is filtered at the queryset level (`CustomerScopedMixin`), and out-of-scope objects return 404 (OWASP API1: BOLA) |
| State integrity | Status fields are read-only in the API; transitions only through validated service actions; money computed server-side only |
| Data integrity | Database CHECK constraints, a partial unique index against double billing, row locks (`select_for_update`) for payments, sequences and discount usage |
| Input validation | DRF serializers + model constraints on the server, zod on the client; one error shape with field-level messages |
| SQL injection | ORM only; no string-built SQL |
| Scheduler endpoint | Bearer secret compared with `hmac.compare_digest`; bounded batch size; idempotent |
| Secrets | Only in environment variables; `.env` is gitignored; `.env.example` holds placeholders only |
| Transport and headers | HTTPS everywhere in prod; `SECURE_PROXY_SSL_HEADER`, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` |
| Audit | `AuditLog` for state transitions, invoice cancellations, payments, discount and staff changes |
| Dependencies | Pinned versions; GitHub Dependabot alerts enabled |

## If a secret leaks
1. Tell the team immediately.
2. **Rotate** the secret at the provider (Neon password, Brevo key, `DJANGO_SECRET_KEY`, `SCHEDULER_SECRET`).
3. Remove it from the repo. Deleting it is not enough, because it stays in git history; rotation is what matters.
