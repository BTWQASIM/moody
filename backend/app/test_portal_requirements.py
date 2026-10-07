"""Regression tests for audited portal access and persistence requirements."""

import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.api import auth, notifications
from app.api.security import require_verified_therapist
from app.db import FirestoreDAO


class RegistrationAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_self_registration_cannot_self_verify(self):
        request = auth.SetClaimsRequest(
            uid="new-therapist",
            role="therapist",
            verified=True,
            status="verified",
            name="New Therapist",
        )
        claims_writer = Mock(return_value={"role": "therapist", "verified": False})

        with (
            patch.object(auth, "verify_token", return_value={"uid": "new-therapist"}),
            patch.object(auth, "get_auth_client", return_value=Mock()),
            patch.object(auth, "get_db_client", return_value=None),
            patch.object(auth, "_is_admin", return_value=False),
            patch.object(auth, "_set_claims_preserving_existing", claims_writer),
        ):
            result = await auth.set_custom_claims(request, "Bearer token")

        written_claims = claims_writer.call_args.args[2]
        self.assertEqual(written_claims, {"role": "therapist", "verified": False})
        self.assertEqual(request.status, "pending_verification")
        self.assertFalse(result["claims"]["verified"])

    async def test_non_admin_cannot_change_another_users_claims(self):
        request = auth.SetClaimsRequest(uid="other-user")
        with (
            patch.object(auth, "verify_token", return_value={"uid": "caller"}),
            patch.object(auth, "get_auth_client", return_value=Mock()),
            patch.object(auth, "get_db_client", return_value=None),
            patch.object(auth, "_is_admin", return_value=False),
        ):
            with self.assertRaises(HTTPException) as raised:
                await auth.set_custom_claims(request, "Bearer token")

        self.assertEqual(raised.exception.status_code, 403)


class VerifiedTherapistTests(unittest.TestCase):
    def test_revoked_firestore_profile_overrides_stale_verified_claim(self):
        snapshot = Mock(exists=True)
        snapshot.to_dict.return_value = {
            "verified": False,
            "status": "suspended",
        }
        db_client = Mock()
        db_client.collection.return_value.document.return_value.get.return_value = snapshot

        with patch("app.api.security.get_db_client", return_value=db_client):
            with self.assertRaises(HTTPException) as raised:
                require_verified_therapist(
                    {"uid": "therapist", "role": "therapist", "verified": True}
                )

        self.assertEqual(raised.exception.status_code, 403)


class PersistenceTests(unittest.IsolatedAsyncioTestCase):
    def test_streamed_documents_receive_firestore_ids(self):
        dao = FirestoreDAO()
        document = Mock(id="document-id")
        document.to_dict.return_value = {"title": "Example", "id": ""}

        rows = dao._stream_data([document])

        self.assertEqual(rows[0]["id"], "document-id")

    async def test_mark_all_notifications_uses_authenticated_user(self):
        fake_db = Mock()
        fake_db.mark_notifications_read.return_value = 3

        with (
            patch.object(
                notifications,
                "verify_token",
                return_value={"uid": "therapist", "role": "therapist"},
            ),
            patch.object(notifications, "get_db_client", return_value=None),
            patch.object(notifications, "db", fake_db),
        ):
            result = await notifications.mark_all_notifications_read("Bearer token")

        fake_db.mark_notifications_read.assert_called_once_with("therapist")
        self.assertEqual(result["updated"], 3)


if __name__ == "__main__":
    unittest.main()
