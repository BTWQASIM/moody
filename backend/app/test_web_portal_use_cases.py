"""Meaningful regression coverage for the therapist/admin web portal use cases."""

import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.api import ai, alerts, appointments, auth, mood, notes, patients, services
from app.models import AppointmentStatus, RiskLevel
from app.password_policy import password_validation_error


class RequestValidationTests(unittest.TestCase):
    def test_patient_rejects_blank_required_identity_fields(self):
        for field in ("firstName", "lastName", "email"):
            payload = {
                "firstName": "Aisha",
                "lastName": "Khan",
                "email": "aisha@example.com",
                field: "   ",
            }
            with self.subTest(field=field), self.assertRaises(ValidationError):
                patients.PatientRequest(**payload)

    def test_appointment_rejects_non_positive_duration(self):
        with self.assertRaises(ValidationError):
            appointments.AppointmentRequest(
                patientId="patient-1",
                scheduledAt=datetime(2026, 10, 10, 10, tzinfo=timezone.utc),
                duration=0,
                type="individual",
            )

    def test_mood_score_must_be_between_one_and_ten(self):
        for score in (0, 11):
            with self.subTest(score=score), self.assertRaises(ValidationError):
                mood.MoodEntryRequest(
                    patientId="patient-1",
                    moodScore=score,
                    emotionalState="anxious",
                )

    def test_clinical_note_rejects_blank_content(self):
        with self.assertRaises(ValidationError):
            notes.ClinicalNoteRequest(patientId="patient-1", content="   ")

    def test_risk_alert_rejects_blank_clinical_fields(self):
        with self.assertRaises(ValidationError):
            alerts.RiskAlertRequest(
                patientId="patient-1",
                title=" ",
                description=" ",
                riskLevel=RiskLevel.HIGH,
            )

    def test_service_rejects_blank_name_and_description(self):
        with self.assertRaises(ValidationError):
            services.ServiceRequest(
                name=" ", description=" ", duration=60, price=100
            )

    def test_password_policy_rejects_spaces_and_common_passwords(self):
        self.assertIsNotNone(password_validation_error("Strong1 Password!"))
        self.assertIsNotNone(password_validation_error("Password1!"))
        self.assertIsNone(password_validation_error("N7!calmRiver"))


class AuthenticationAndProfileTests(unittest.IsolatedAsyncioTestCase):
    def test_availability_normalizes_weekdays_and_skips_disabled_days(self):
        result = auth._normalize_availability(
            [
                {"day": "Monday", "enabled": True, "start": "08:30", "end": "12:30"},
                {"day": "Sunday", "enabled": True, "start": "10:00", "end": "14:00"},
                {"day": "Tuesday", "enabled": False, "start": "09:00", "end": "17:00"},
            ]
        )
        self.assertEqual(
            result,
            [
                {"dayOfWeek": 1, "startTime": "08:30", "endTime": "12:30"},
                {"dayOfWeek": 0, "startTime": "10:00", "endTime": "14:00"},
            ],
        )

    async def test_unverified_non_portal_user_cannot_update_therapist_profile(self):
        missing = Mock(exists=False)
        db_client = Mock()
        db_client.collection.return_value.document.return_value.get.return_value = missing

        with (
            patch.object(
                auth,
                "verify_token",
                return_value={"uid": "mobile-user", "role": "patient", "verified": False},
            ),
            patch.object(auth, "get_auth_client", return_value=Mock()),
            patch.object(auth, "get_db_client", return_value=db_client),
            patch("app.api.security.get_db_client", return_value=db_client),
        ):
            with self.assertRaises(HTTPException) as raised:
                await auth.update_my_profile(
                    auth.UpdateProfileRequest(name="Unauthorized"), "Bearer token"
                )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_profile_email_is_persisted_in_auth_and_firestore(self):
        admin_snapshot = Mock(exists=False)
        therapist_snapshot = Mock(exists=True)
        therapist_snapshot.to_dict.return_value = {
            "verified": True,
            "status": "verified",
        }
        therapist_ref = Mock()
        therapist_ref.get.return_value = therapist_snapshot
        admin_ref = Mock()
        admin_ref.get.return_value = admin_snapshot
        db_client = Mock()
        db_client.collection.side_effect = lambda name: Mock(
            document=Mock(
                return_value=admin_ref if name == "admins" else therapist_ref
            )
        )
        auth_client = Mock()
        auth_client.get_user.return_value = Mock(
            display_name="Old Name", email="old@moodie.com"
        )

        with (
            patch.object(
                auth,
                "verify_token",
                return_value={"uid": "therapist-1", "role": "therapist", "verified": True},
            ),
            patch.object(auth, "get_auth_client", return_value=auth_client),
            patch.object(auth, "get_db_client", return_value=db_client),
            patch("app.api.security.get_db_client", return_value=db_client),
        ):
            result = await auth.update_my_profile(
                auth.UpdateProfileRequest(
                    name="Dr New Name", email="  NEW@MOODIE.COM "
                ),
                "Bearer token",
            )

        auth_client.update_user.assert_called_once_with(
            "therapist-1",
            display_name="Dr New Name",
            email="new@moodie.com",
        )
        saved = therapist_ref.set.call_args.args[0]
        self.assertEqual(saved["email"], "new@moodie.com")
        self.assertEqual(saved["name"], "Dr New Name")
        self.assertEqual(result["status"], "success")

    async def test_profile_identity_rolls_back_if_firestore_write_fails(self):
        admin_snapshot = Mock(exists=False)
        therapist_snapshot = Mock(exists=True)
        therapist_snapshot.to_dict.return_value = {
            "verified": True,
            "status": "verified",
        }
        therapist_ref = Mock()
        therapist_ref.get.return_value = therapist_snapshot
        therapist_ref.set.side_effect = RuntimeError("Firestore unavailable")
        admin_ref = Mock()
        admin_ref.get.return_value = admin_snapshot
        db_client = Mock()
        db_client.collection.side_effect = lambda name: Mock(
            document=Mock(
                return_value=admin_ref if name == "admins" else therapist_ref
            )
        )
        auth_client = Mock()
        auth_client.get_user.return_value = Mock(
            display_name="Old Name", email="old@moodie.com"
        )

        with (
            patch.object(
                auth,
                "verify_token",
                return_value={"uid": "therapist-1", "role": "therapist", "verified": True},
            ),
            patch.object(auth, "get_auth_client", return_value=auth_client),
            patch.object(auth, "get_db_client", return_value=db_client),
            patch("app.api.security.get_db_client", return_value=db_client),
            self.assertRaises(HTTPException) as raised,
        ):
            await auth.update_my_profile(
                auth.UpdateProfileRequest(
                    name="Dr New Name", email="new@moodie.com"
                ),
                "Bearer token",
            )

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(auth_client.update_user.call_count, 2)
        auth_client.update_user.assert_any_call(
            "therapist-1",
            display_name="Old Name",
            email="old@moodie.com",
        )


class PatientUseCaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_patient_keeps_service_unavailable_error(self):
        with (
            patch.object(patients, "verify_token", return_value={"uid": "therapist-1"}),
            patch.object(patients, "get_db_client", return_value=None),
        ):
            with self.assertRaises(HTTPException) as raised:
                await patients.create_patient(
                    patients.PatientRequest(
                        firstName="Aisha", lastName="Khan", email="aisha@example.com"
                    ),
                    "Bearer token",
                )

        self.assertEqual(raised.exception.status_code, 503)

    async def test_create_patient_sets_owner_and_safe_defaults(self):
        fake_db = Mock()
        fake_db.create_patient.return_value = "patient-1"
        with (
            patch.object(patients, "db", fake_db),
            patch.object(patients, "verify_token", return_value={"uid": "therapist-1"}),
            patch.object(patients, "get_db_client", return_value=Mock()),
        ):
            result = await patients.create_patient(
                patients.PatientRequest(
                    firstName="Aisha", lastName="Khan", email="aisha@example.com"
                ),
                "Bearer token",
            )

        profile = fake_db.create_patient.call_args.args[0]
        self.assertEqual(profile.therapistUid, "therapist-1")
        self.assertEqual(profile.status.value, "pending_intake")
        self.assertEqual(profile.riskLevel.value, "low")
        self.assertEqual(result["patientId"], "patient-1")

    async def test_foreign_patient_cannot_be_updated(self):
        fake_db = Mock()
        fake_db.get_patient.return_value = {"therapistUid": "therapist-2"}
        with (
            patch.object(patients, "db", fake_db),
            patch.object(patients, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await patients.update_patient(
                    "patient-1",
                    patients.PatientUpdate(firstName="Changed"),
                    "Bearer token",
                )
        self.assertEqual(raised.exception.status_code, 403)
        fake_db.update_patient.assert_not_called()

    async def test_unlinked_mobile_activity_returns_explicit_empty_state(self):
        fake_db = Mock()
        fake_db.get_patient.return_value = {"therapistUid": "therapist-1"}
        with (
            patch.object(patients, "db", fake_db),
            patch.object(patients, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            result = await patients.get_patient_mobile_activity(
                "patient-1", 30, "Bearer token"
            )
        self.assertFalse(result["linked"])
        self.assertEqual(result["moodCheckins"], [])
        self.assertEqual(result["journalEntries"], [])
        fake_db.get_mobile_mood_checkins.assert_not_called()


class AppointmentUseCaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_appointment_update_is_rejected(self):
        fake_db = Mock()
        fake_db.get_appointment.return_value = {"therapistUid": "therapist-1"}
        fake_db._therapist_uid_aliases.return_value = {"therapist-1"}
        with (
            patch.object(appointments, "db", fake_db),
            patch.object(appointments, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await appointments.update_appointment(
                    "appointment-1", appointments.AppointmentUpdate(), "Bearer token"
                )
        self.assertEqual(raised.exception.status_code, 400)
        fake_db.update_appointment.assert_not_called()

    async def test_foreign_appointment_cannot_be_cancelled(self):
        fake_db = Mock()
        fake_db.get_appointment.return_value = {"therapistUid": "therapist-2"}
        fake_db._therapist_uid_aliases.return_value = {"therapist-1"}
        with (
            patch.object(appointments, "db", fake_db),
            patch.object(appointments, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await appointments.cancel_appointment("appointment-1", "Bearer token")
        self.assertEqual(raised.exception.status_code, 403)

    async def test_confirm_mobile_request_links_portal_patient(self):
        fake_db = Mock()
        fake_db.get_appointment.return_value = {
            "therapistUid": "therapist-1",
            "patientId": "firebase-patient",
            "source": "mobile",
        }
        fake_db._therapist_uid_aliases.return_value = {"therapist-1"}
        fake_db.ensure_patient_from_mobile_appointment.return_value = "portal-patient"
        with (
            patch.object(appointments, "db", fake_db),
            patch.object(appointments, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            result = await appointments.confirm_appointment(
                "appointment-1", "Bearer token"
            )
        self.assertEqual(result["portalPatientId"], "portal-patient")
        calls = fake_db.update_appointment.call_args_list
        self.assertEqual(calls[0].args[1]["status"], AppointmentStatus.CONFIRMED.value)
        self.assertEqual(calls[1].args[1], {"portalPatientId": "portal-patient"})


class ClinicalWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_low_mood_creates_high_risk_alert(self):
        fake_db = Mock()
        fake_db.get_patient.return_value = {"therapistUid": "therapist-1"}
        fake_db.create_mood_entry.return_value = "mood-1"
        with (
            patch.object(mood, "db", fake_db),
            patch.object(mood, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            result = await mood.create_mood_entry(
                mood.MoodEntryRequest(
                    patientId="patient-1",
                    moodScore=2,
                    emotionalState="distressed",
                    notes="Could not sleep",
                ),
                "Bearer token",
            )
        self.assertEqual(result["riskLevel"], RiskLevel.HIGH)
        alert = fake_db.create_risk_alert.call_args.args[0]
        self.assertEqual(alert.patientId, "patient-1")
        self.assertEqual(alert.source, "mood_entry")

    async def test_foreign_patient_note_is_forbidden(self):
        fake_db = Mock()
        fake_db.get_patient.return_value = {"therapistUid": "therapist-2"}
        with (
            patch.object(notes, "db", fake_db),
            patch.object(notes, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await notes.create_clinical_note(
                    notes.ClinicalNoteRequest(
                        patientId="patient-1", content="Reviewed treatment plan"
                    ),
                    "Bearer token",
                )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_manual_alert_creates_notification_for_same_therapist(self):
        fake_db = Mock()
        fake_db.get_patient.return_value = {"therapistUid": "therapist-1"}
        fake_db.create_risk_alert.return_value = "alert-1"
        with (
            patch.object(alerts, "db", fake_db),
            patch.object(alerts, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            result = await alerts.create_risk_alert(
                alerts.RiskAlertRequest(
                    patientId="patient-1",
                    title="Urgent review",
                    description="Mood declined across three check-ins",
                    riskLevel=RiskLevel.HIGH,
                ),
                "Bearer token",
            )
        self.assertEqual(result["alertId"], "alert-1")
        notification = fake_db.create_notification.call_args.args[0]
        self.assertEqual(notification.userId, "therapist-1")
        self.assertEqual(notification.relatedId, "patient-1")


class ServiceUseCaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_service_is_created_for_authenticated_therapist(self):
        fake_db = Mock()
        fake_db.create_service.return_value = "service-1"
        with (
            patch.object(services, "db", fake_db),
            patch.object(services, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            result = await services.create_service(
                services.ServiceRequest(
                    name="Trauma-informed therapy",
                    description="Individual trauma-focused sessions",
                    duration=60,
                    price=5000,
                    specialization="PTSD",
                    deliveryMode="online",
                ),
                "Bearer token",
            )
        offering = fake_db.create_service.call_args.args[0]
        self.assertEqual(offering.therapistUid, "therapist-1")
        self.assertEqual(offering.specialization, "PTSD")
        self.assertEqual(result["serviceId"], "service-1")

    async def test_service_from_another_therapist_cannot_be_updated(self):
        fake_db = Mock()
        fake_db.get_services_for_therapist.return_value = []
        with (
            patch.object(services, "db", fake_db),
            patch.object(services, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await services.update_service(
                    "foreign-service",
                    services.ServiceUpdateRequest(price=5500),
                    "Bearer token",
                )
        self.assertEqual(raised.exception.status_code, 404)
        fake_db.update_service.assert_not_called()


class AIUseCaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_summary_task_requires_owned_appointment(self):
        fake_db = Mock()
        fake_db.get_appointment.return_value = {"therapistUid": "therapist-2"}
        with (
            patch.object(ai, "db", fake_db),
            patch.object(ai, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await ai.submit_summarize_task(
                    ai.SummarizeNotesRequest(
                        appointmentId="appointment-1",
                        content="Patient practised grounding and reported better sleep.",
                    ),
                    "Bearer token",
                )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_action_item_task_queues_meaningful_content(self):
        fake_db = Mock()
        fake_db.get_appointment.return_value = {"therapistUid": "therapist-1"}
        fake_task = Mock(id="task-1")
        with (
            patch.object(ai, "db", fake_db),
            patch.object(ai, "verify_token", return_value={"uid": "therapist-1"}),
            patch.object(ai.extract_action_items, "delay", return_value=fake_task) as delay,
        ):
            result = await ai.submit_extract_items(
                ai.ExtractItemsRequest(
                    appointmentId="appointment-1",
                    content="Patient will complete a sleep diary before the next session.",
                ),
                "Bearer token",
            )
        delay.assert_called_once_with(
            "appointment-1",
            "Patient will complete a sleep diary before the next session.",
        )
        self.assertEqual(result["taskId"], "task-1")


if __name__ == "__main__":
    unittest.main()
