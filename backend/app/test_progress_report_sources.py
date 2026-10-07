"""Focused tests for progress-report source selection."""

import unittest
from unittest.mock import Mock

from app.db import FirestoreDAO


class ProgressReportSourceTests(unittest.TestCase):
    def test_uses_mobile_and_portal_sources_with_both_patient_ids(self):
        dao = FirestoreDAO.__new__(FirestoreDAO)
        dao.db = Mock()
        dao.get_patient = Mock(
            return_value={"firebaseUid": "firebase-patient", "id": "portal-patient"}
        )
        dao.get_mobile_mood_checkins = Mock(
            return_value=[{"moods": ["Calm"], "userId": "firebase-patient"}]
        )
        dao.get_mobile_journal_entries = Mock(
            return_value=[{"entry": "Used breathing exercise", "userId": "firebase-patient"}]
        )
        dao.get_notes_for_patient = Mock(
            return_value=[{"content": "Reviewed exposure plan"}]
        )
        dao.get_appointments_for_patient = Mock(
            return_value=[{"status": "completed", "type": "follow-up"}]
        )

        dao.db.collection.return_value.where.return_value.stream.return_value = []

        sources = dao.get_progress_report_sources("portal-patient")

        dao.get_mobile_journal_entries.assert_called_once_with("firebase-patient", 30)
        dao.get_notes_for_patient.assert_called_once_with("portal-patient")
        dao.get_appointments_for_patient.assert_called_once_with("portal-patient")
        self.assertEqual(sources["mood_checkins"][0]["moods"], ["Calm"])
        self.assertEqual(sources["journals"][0]["entry"], "Used breathing exercise")
        self.assertEqual(sources["clinical_notes"][0]["content"], "Reviewed exposure plan")
        self.assertEqual(sources["appointments"][0]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
