"""Regression tests for transparent patient-field encryption."""

import base64
import os
import unittest
from unittest.mock import Mock

from app.db import FirestoreDAO
from app.field_encryption import (
    ENCRYPTED_VALUE_PREFIX,
    FieldEncryptionError,
    PatientFieldEncryption,
)


class PatientFieldEncryptionTests(unittest.TestCase):
    def setUp(self):
        self.codec = PatientFieldEncryption(os.urandom(32))

    def test_aes_gcm_round_trip_is_randomized_and_hides_plaintext(self):
        note = "Patient described panic symptoms and medication concerns."
        first = self.codec.encrypt_notes(note)
        second = self.codec.encrypt_notes(note)

        self.assertTrue(str(first).startswith(ENCRYPTED_VALUE_PREFIX))
        self.assertNotIn("panic symptoms", str(first))
        self.assertNotEqual(first, second)
        self.assertEqual(self.codec.decrypt_notes(first), note)
        self.assertEqual(self.codec.decrypt_notes(second), note)

    def test_plaintext_records_remain_compatible_when_encryption_is_disabled(self):
        disabled = PatientFieldEncryption()
        self.assertEqual(disabled.encrypt_notes("Existing note"), "Existing note")
        self.assertEqual(disabled.decrypt_notes("Existing note"), "Existing note")

        encrypted = self.codec.encrypt_notes("Protected note")
        with self.assertRaises(FieldEncryptionError):
            disabled.decrypt_notes(encrypted)

    def test_modified_ciphertext_fails_integrity_verification(self):
        encrypted = str(self.codec.encrypt_notes("Protected note"))
        replacement = "A" if encrypted[-1] != "A" else "B"
        tampered = f"{encrypted[:-1]}{replacement}"

        with self.assertRaises(FieldEncryptionError):
            self.codec.decrypt_notes(tampered)

    def test_environment_key_must_be_a_32_byte_base64_value(self):
        previous = os.environ.get("PATIENT_DATA_ENCRYPTION_KEY")
        try:
            os.environ["PATIENT_DATA_ENCRYPTION_KEY"] = base64.b64encode(
                os.urandom(32)
            ).decode("ascii")
            self.assertTrue(PatientFieldEncryption.from_environment().enabled)

            os.environ["PATIENT_DATA_ENCRYPTION_KEY"] = "not-base64"
            with self.assertRaises(FieldEncryptionError):
                PatientFieldEncryption.from_environment()
        finally:
            if previous is None:
                os.environ.pop("PATIENT_DATA_ENCRYPTION_KEY", None)
            else:
                os.environ["PATIENT_DATA_ENCRYPTION_KEY"] = previous

    def test_dao_encrypts_writes_and_transparently_decrypts_reads(self):
        dao = FirestoreDAO.__new__(FirestoreDAO)
        dao._patient_field_encryption = self.codec
        dao.db = Mock()
        patient_ref = dao.db.collection.return_value.document.return_value

        dao.update_patient("patient-1", {"clinicalNotes": "Sensitive note"})
        stored = patient_ref.update.call_args.args[0]
        self.assertTrue(stored["clinicalNotes"].startswith(ENCRYPTED_VALUE_PREFIX))
        self.assertNotIn("Sensitive note", stored["clinicalNotes"])

        snapshot = Mock(exists=True)
        snapshot.to_dict.return_value = {
            "therapistUid": "therapist-1",
            "clinicalNotes": stored["clinicalNotes"],
        }
        patient_ref.get.return_value = snapshot

        patient = dao.get_patient("patient-1")
        self.assertEqual(patient["clinicalNotes"], "Sensitive note")
        self.assertEqual(patient["id"], "patient-1")


if __name__ == "__main__":
    unittest.main()
