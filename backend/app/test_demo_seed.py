"""Regression tests for the therapist-scoped portal demonstration seed."""

import unittest
from datetime import datetime, timezone

from scripts.seed_portal_demo import (
    ID_PREFIX,
    PATIENTS,
    SEED_TAG,
    build_demo_documents,
    dataset_counts,
    validate_dataset,
)


class DemoSeedTests(unittest.TestCase):
    def setUp(self):
        self.therapist_uid = "therapist-firebase-uid"
        self.patient_uids = {
            patient["email"]: f"firebase-auth-uid-{index:02d}"
            for index, patient in enumerate(PATIENTS, start=1)
        }
        self.documents = build_demo_documents(
            self.therapist_uid,
            "Dr Brock Lesnar",
            datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc),
            self.patient_uids,
        )

    def test_builds_comprehensive_portal_dataset(self):
        counts = dataset_counts(self.documents)

        self.assertEqual(counts["patients"], 8)
        self.assertEqual(counts["services"], 5)
        self.assertEqual(counts["appointments"], 36)
        self.assertEqual(counts["clinicalNotes"], 16)
        self.assertEqual(counts["moodEntries"], 24)
        self.assertEqual(counts["mood_checkins"], 24)
        self.assertEqual(counts["journal_entries"], 16)
        self.assertEqual(counts["clincal_summaries"], 8)
        self.assertEqual(counts["users"], 8)
        self.assertEqual(counts["onboarding_responses"], 8)
        self.assertGreaterEqual(counts["riskAlerts"], 5)
        self.assertGreaterEqual(counts["notifications"], 8)
        self.assertGreater(sum(counts.values()), 155)

    def test_every_document_is_scoped_and_cleanup_safe(self):
        validate_dataset(self.documents, self.therapist_uid)

        for collection_name, collection in self.documents.items():
            for doc_id, payload in collection.items():
                if collection_name not in {"users", "onboarding_responses"}:
                    self.assertTrue(doc_id.startswith(ID_PREFIX))
                self.assertEqual(payload["seedTag"], SEED_TAG)
                self.assertEqual(payload["seedTherapistUid"], self.therapist_uid)

    def test_appointments_link_portal_and_mobile_patient_ids(self):
        patients = self.documents["patients"]
        portal_ids = set(patients)
        mobile_ids = {patient["firebaseUid"] for patient in patients.values()}

        for appointment in self.documents["appointments"].values():
            self.assertIn(appointment["portalPatientId"], portal_ids)
            self.assertIn(appointment["patientId"], mobile_ids)
            self.assertEqual(appointment["therapistName"], "Dr Brock Lesnar")

        self.assertEqual(set(self.documents["users"]), mobile_ids)
        self.assertEqual(set(self.documents["onboarding_responses"]), mobile_ids)
        for uid, profile in self.documents["users"].items():
            self.assertEqual(profile["uid"], uid)
            self.assertEqual(profile["therapistUid"], self.therapist_uid)
            self.assertTrue(profile["onboarding_complete"])

    def test_reports_receive_completed_sessions_across_multiple_months(self):
        completed = [
            appointment
            for appointment in self.documents["appointments"].values()
            if appointment["status"] == "completed"
        ]
        months = {
            (appointment["scheduledAt"].year, appointment["scheduledAt"].month)
            for appointment in completed
        }

        self.assertEqual(len(completed), 24)
        self.assertGreaterEqual(len(months), 3)

    def test_patient_facing_identity_fields_look_realistic(self):
        for patient in self.documents["patients"].values():
            email = patient["email"].lower()
            self.assertTrue(email.endswith("@moodie.com"))
            self.assertNotIn("demo", email)
            self.assertNotIn("example", email)
            self.assertNotIn("demo", patient["address"].lower())
            self.assertNotIn("demo", patient["insuranceProvider"].lower())

        for profile in self.documents["users"].values():
            self.assertNotIn("demo", profile["occupation"].lower())


if __name__ == "__main__":
    unittest.main()
