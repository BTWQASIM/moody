"""Focused regression tests for portal-created appointment patient IDs."""

import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.api import appointments


class CreateAppointmentTests(unittest.IsolatedAsyncioTestCase):
    async def test_uses_firebase_uid_and_preserves_portal_patient_id(self):
        fake_db = Mock()
        fake_db.get_patient.return_value = {
            "therapistUid": "therapist-uid",
            "firebaseUid": "patient-firebase-uid",
        }
        fake_db.get_therapist.return_value = {"name": "Dr. Test Therapist"}
        fake_db.create_appointment.return_value = "appointment-id"
        request = appointments.AppointmentRequest(
            patientId="portal-patient-id",
            scheduledAt=datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc),
            duration=60,
            type="follow-up",
        )

        with (
            patch.object(appointments, "db", fake_db),
            patch.object(
                appointments,
                "verify_token",
                return_value={"uid": "therapist-uid"},
            ),
        ):
            result = await appointments.create_appointment(request, "Bearer token")

        created = fake_db.create_appointment.call_args.args[0]
        self.assertEqual(created.patientId, "patient-firebase-uid")
        self.assertEqual(created.portalPatientId, "portal-patient-id")
        self.assertEqual(created.therapistName, "Dr. Test Therapist")
        self.assertEqual(result["appointmentId"], "appointment-id")

    async def test_rejects_unlinked_patient(self):
        fake_db = Mock()
        fake_db.get_patient.return_value = {"therapistUid": "therapist-uid"}
        request = appointments.AppointmentRequest(
            patientId="portal-patient-id",
            scheduledAt=datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc),
            duration=60,
        )

        with (
            patch.object(appointments, "db", fake_db),
            patch.object(
                appointments,
                "verify_token",
                return_value={"uid": "therapist-uid"},
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await appointments.create_appointment(request, "Bearer token")

        self.assertEqual(raised.exception.status_code, 409)
        fake_db.create_appointment.assert_not_called()


if __name__ == "__main__":
    unittest.main()
