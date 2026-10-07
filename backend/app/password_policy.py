"""Shared password rules for new passwords (signup / password change only)."""

from __future__ import annotations

import re
from typing import List

PASSWORD_MIN_LENGTH = 8

_PASSWORD_RULES: List[tuple[str, re.Pattern[str]]] = [
    ("at least 8 characters", re.compile(r".{8,}")),
    ("one uppercase letter (A–Z)", re.compile(r"[A-Z]")),
    ("one lowercase letter (a–z)", re.compile(r"[a-z]")),
    ("one number (0–9)", re.compile(r"\d")),
    ("one special character", re.compile(r"[^A-Za-z0-9]")),
    ("no spaces", re.compile(r"^\S+$")),
]

_COMMON_PASSWORD_TERMS = ("password", "qwerty", "letmein", "welcome", "admin")


def validate_password(password: str) -> List[str]:
    """Return human-readable requirement labels that the password fails."""
    if not password:
        return [rule[0] for rule in _PASSWORD_RULES]

    missing = [label for label, pattern in _PASSWORD_RULES if not pattern.search(password)]
    lowered = password.lower()
    if any(term in lowered for term in _COMMON_PASSWORD_TERMS):
        missing.append("no common password words")
    return missing


def password_validation_error(password: str) -> str | None:
    missing = validate_password(password)
    if not missing:
        return None
    return f"Password must include: {', '.join(missing)}."
