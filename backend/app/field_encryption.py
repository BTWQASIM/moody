"""Small, versioned application-level encryption for sensitive patient fields."""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


ENCRYPTED_VALUE_PREFIX = "enc:v1:"
PATIENT_NOTES_CONTEXT = b"patients.clinicalNotes:v1"


class FieldEncryptionError(RuntimeError):
    """Raised when encrypted data cannot be safely processed."""


@dataclass(frozen=True)
class PatientFieldEncryption:
    """Encrypt patient profile notes with AES-256-GCM when a key is configured."""

    key: bytes | None = None

    @classmethod
    def from_environment(cls) -> "PatientFieldEncryption":
        encoded_key = os.getenv("PATIENT_DATA_ENCRYPTION_KEY", "").strip()
        if not encoded_key:
            return cls()

        try:
            key = base64.b64decode(encoded_key, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise FieldEncryptionError(
                "PATIENT_DATA_ENCRYPTION_KEY must be valid base64"
            ) from exc
        if len(key) != 32:
            raise FieldEncryptionError(
                "PATIENT_DATA_ENCRYPTION_KEY must decode to exactly 32 bytes"
            )
        return cls(key)

    @property
    def enabled(self) -> bool:
        return self.key is not None

    def encrypt_notes(self, value: object) -> object:
        if not isinstance(value, str) or not value or not self.enabled:
            return value
        if value.startswith(ENCRYPTED_VALUE_PREFIX):
            return value

        nonce = os.urandom(12)
        ciphertext = AESGCM(self.key).encrypt(
            nonce,
            value.encode("utf-8"),
            PATIENT_NOTES_CONTEXT,
        )
        payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
        return f"{ENCRYPTED_VALUE_PREFIX}{payload}"

    def decrypt_notes(self, value: object) -> object:
        if not isinstance(value, str) or not value.startswith(ENCRYPTED_VALUE_PREFIX):
            return value
        if not self.enabled:
            raise FieldEncryptionError(
                "Encrypted patient notes cannot be read because the encryption key is missing"
            )

        encoded_payload = value.removeprefix(ENCRYPTED_VALUE_PREFIX)
        try:
            payload = base64.urlsafe_b64decode(encoded_payload.encode("ascii"))
            if len(payload) < 29:
                raise ValueError("encrypted payload is too short")
            nonce, ciphertext = payload[:12], payload[12:]
            plaintext = AESGCM(self.key).decrypt(
                nonce,
                ciphertext,
                PATIENT_NOTES_CONTEXT,
            )
            return plaintext.decode("utf-8")
        except (InvalidTag, UnicodeDecodeError, ValueError) as exc:
            raise FieldEncryptionError(
                "Patient notes could not be decrypted or failed integrity verification"
            ) from exc
