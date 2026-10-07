"""Authorization, admin, upload, and HTTP integration coverage."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.api import ai, appointments, auth, notifications, security, uploads
from app.main import app


class FakeSnapshot:
    def __init__(self, doc_id: str, payload=None):
        self.id = doc_id
        self._payload = payload
        self.exists = payload is not None

    def to_dict(self):
        return dict(self._payload or {})


class FakeDocumentRef:
    def __init__(self, doc_id: str, store: dict):
        self.doc_id = doc_id
        self.store = store

    def get(self):
        return FakeSnapshot(self.doc_id, self.store.get(self.doc_id))

    def set(self, payload, merge=False):
        current = self.store.get(self.doc_id, {}) if merge else {}
        self.store[self.doc_id] = {**current, **payload}

    def update(self, payload):
        self.store[self.doc_id] = {**self.store.get(self.doc_id, {}), **payload}


class FakeCollection:
    def __init__(self, store: dict):
        self.store = store

    def document(self, doc_id: str):
        return FakeDocumentRef(doc_id, self.store)

    def stream(self):
        return [FakeSnapshot(doc_id, payload) for doc_id, payload in self.store.items()]


class FakeFirestore:
    def __init__(self, collections=None):
        self.collections = collections or {}

    def collection(self, name: str):
        return FakeCollection(self.collections.setdefault(name, {}))


class PortalSecurityTests(unittest.TestCase):
    def test_admin_claim_cannot_use_therapist_api(self):
        with self.assertRaises(HTTPException) as raised:
            security.require_verified_therapist(
                {"uid": "admin-1", "role": "admin", "verified": True}
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_missing_uid_is_rejected_even_with_verified_claim(self):
        with self.assertRaises(HTTPException) as raised:
            security.require_verified_therapist(
                {"role": "therapist", "verified": True}
            )
        self.assertEqual(raised.exception.status_code, 401)

    def test_verified_active_therapist_is_allowed(self):
        db_client = FakeFirestore(
            {
                "therapists": {
                    "therapist-1": {"verified": True, "status": "verified"}
                }
            }
        )
        with patch("app.api.security.get_db_client", return_value=db_client):
            security.require_verified_therapist(
                {"uid": "therapist-1", "role": "therapist", "verified": True}
            )


class AdminUseCaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_admin_directory_excludes_admin_records(self):
        db_client = FakeFirestore(
            {
                "therapists": {
                    "pending-1": {
                        "name": "Dr Pending",
                        "createdAt": "2026-10-07",
                    },
                    "role-admin": {"name": "Role Admin", "role": "admin"},
                    "listed-admin": {"name": "Listed Admin"},
                },
                "admins": {"listed-admin": {"role": "admin"}},
                "uploadedFiles": {
                    "credential-1": {
                        "ownerUid": "pending-1",
                        "category": "document",
                        "fileUrl": "/api/uploads/file/credential-1",
                    },
                    "recording-1": {
                        "ownerUid": "pending-1",
                        "category": "audio_recording",
                        "fileUrl": "/api/uploads/file/recording-1",
                    },
                },
            }
        )
        with (
            patch.object(auth, "verify_token", return_value={"uid": "admin-1", "role": "admin"}),
            patch.object(auth, "get_db_client", return_value=db_client),
        ):
            result = await auth.list_therapists_for_admin("Bearer token")

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["therapists"][0]["uid"], "pending-1")
        self.assertFalse(result["therapists"][0]["verified"])
        self.assertEqual(
            result["therapists"][0]["documentUrls"],
            ["/api/uploads/file/credential-1"],
        )

    async def test_admin_notification_queue_only_contains_pending_applications(self):
        db_client = FakeFirestore(
            {
                "therapists": {
                    "pending-1": {
                        "name": "Dr Pending",
                        "verified": False,
                        "status": "pending_verification",
                        "createdAt": "2026-10-07",
                    },
                    "verified-1": {
                        "name": "Dr Verified",
                        "verified": True,
                        "status": "verified",
                    },
                    "rejected-1": {
                        "name": "Dr Rejected",
                        "verified": False,
                        "status": "rejected",
                    },
                },
                "admins": {"admin-1": {"role": "admin"}},
            }
        )
        with (
            patch.object(notifications, "verify_token", return_value={"uid": "admin-1", "role": "admin"}),
            patch.object(notifications, "get_db_client", return_value=db_client),
        ):
            result = await notifications.get_notifications("Bearer token")

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["notifications"][0]["relatedId"], "pending-1")

    async def test_admin_cannot_set_weak_therapist_password(self):
        db_client = FakeFirestore(
            {
                "therapists": {"therapist-1": {"role": "therapist"}},
                "admins": {},
            }
        )
        auth_client = Mock()
        with (
            patch.object(auth, "verify_token", return_value={"uid": "admin-1", "role": "admin"}),
            patch.object(auth, "get_auth_client", return_value=auth_client),
            patch.object(auth, "get_db_client", return_value=db_client),
        ):
            with self.assertRaises(HTTPException) as raised:
                await auth.update_therapist_credentials(
                    "therapist-1",
                    auth.UpdateTherapistCredentialsRequest(password="Password1!"),
                    "Bearer token",
                )

        self.assertEqual(raised.exception.status_code, 400)
        auth_client.update_user.assert_not_called()


class UploadSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_delete_rejects_uid_that_only_appears_inside_another_path_segment(self):
        with patch.object(uploads, "verify_token", return_value={"uid": "abc"}):
            with self.assertRaises(HTTPException) as raised:
                await uploads.delete_file(
                    "documents/notabc/license/file.pdf", "Bearer token"
                )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_owner_can_delete_local_upload(self):
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            target = root / "documents" / "therapist-1" / "license" / "file.pdf"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"test document")

            with (
                patch.object(uploads, "LOCAL_UPLOADS_ROOT", root),
                patch.object(uploads, "verify_token", return_value={"uid": "therapist-1"}),
                patch.object(uploads, "get_bucket", side_effect=RuntimeError("offline")),
            ):
                result = await uploads.delete_file(
                    "documents/therapist-1/license/file.pdf", "Bearer token"
                )

            self.assertEqual(result["status"], "success")
            self.assertFalse(target.exists())


class AIIntegrationTests(unittest.TestCase):
    def test_rejects_empty_text_document(self):
        with self.assertRaises(HTTPException) as raised:
            ai.extract_notes_text("empty.txt", b"\n \n")
        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("No readable text", raised.exception.detail)

    def test_rejects_corrupt_pdf(self):
        with self.assertRaises(HTTPException) as raised:
            ai.extract_notes_text("notes.pdf", b"not a real PDF")
        self.assertEqual(raised.exception.status_code, 400)


class HttpIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_request_model_validation_happens_at_http_boundary(self):
        response = self.client.post(
            "/api/appointments/",
            headers={"Authorization": "Bearer invalid"},
            json={
                "patientId": "patient-1",
                "scheduledAt": "2026-10-10T10:00:00Z",
                "duration": 0,
                "type": "individual",
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertTrue(
            any(error.get("loc", [])[-1] == "duration" for error in response.json()["detail"])
        )

    def test_cors_preflight_allows_configured_frontend(self):
        response = self.client.options(
            "/api/patients/",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "http://localhost:3000",
        )


if __name__ == "__main__":
    unittest.main()
