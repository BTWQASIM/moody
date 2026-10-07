"""Focused regression tests for persistent therapist profile photos."""

import unittest
from io import BytesIO
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException
from PIL import Image

from app.api import uploads
from app.api.uploads import PROFILE_PHOTO_MAX_BYTES, normalize_profile_photo


class ProfilePhotoTests(unittest.TestCase):
    def test_normalizes_photo_for_firestore_and_mobile_rendering(self):
        source = BytesIO()
        Image.new("RGB", (1600, 1200), "purple").save(source, format="PNG")

        normalized = normalize_profile_photo(source.getvalue())

        self.assertLessEqual(len(normalized), PROFILE_PHOTO_MAX_BYTES)
        with Image.open(BytesIO(normalized)) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertLessEqual(image.width, 512)
            self.assertLessEqual(image.height, 512)

    def test_rejects_non_image_content(self):
        with self.assertRaises(HTTPException) as raised:
            normalize_profile_photo(b"not an image")

        self.assertEqual(raised.exception.status_code, 400)


class DurableFileUploadTests(unittest.TestCase):
    def test_storage_upload_returns_non_expiring_download_token_url(self):
        blob = Mock()
        bucket = Mock(name="bucket")
        bucket.name = "moodie.appspot.com"
        bucket.blob.return_value = blob

        with (
            patch.object(uploads, "get_bucket", return_value=bucket),
            patch.object(uploads.secrets, "token_urlsafe", return_value="stable-token"),
        ):
            url = uploads.upload_to_storage_or_local(
                "documents/user 1/license.pdf", b"document", "application/pdf"
            )

        self.assertIn("documents%2Fuser%201%2Flicense.pdf", url)
        self.assertIn("token=stable-token", url)
        blob.upload_from_string.assert_called_once_with(
            b"document", content_type="application/pdf"
        )
        self.assertEqual(
            blob.metadata, {"firebaseStorageDownloadTokens": "stable-token"}
        )
        blob.patch.assert_called_once_with()

    def test_production_does_not_fall_back_to_ephemeral_disk(self):
        with (
            patch.object(uploads, "get_bucket", side_effect=RuntimeError("offline")),
            patch.object(uploads, "ALLOW_LOCAL_UPLOAD_FALLBACK", False),
            patch.object(uploads, "local_upload") as local_upload,
            self.assertRaises(HTTPException) as raised,
        ):
            uploads.upload_to_storage_or_local(
                "documents/user/license.pdf", b"document", "application/pdf"
            )

        self.assertEqual(raised.exception.status_code, 503)
        local_upload.assert_not_called()


class SessionExportPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_export_uses_dedicated_fields_and_preserves_session_notes(self):
        fake_db = Mock()
        fake_db.get_appointment.return_value = {
            "therapistUid": "therapist-1",
            "sessionNotes": "Keep these clinical notes",
        }
        upload = Mock(
            filename="session.pdf",
            content_type="application/pdf",
            size=8,
        )
        upload.read = AsyncMock(return_value=b"pdf-data")

        with (
            patch.object(
                uploads, "verify_token", return_value={"uid": "therapist-1"}
            ),
            patch.object(uploads, "db", fake_db),
            patch.object(
                uploads,
                "upload_to_storage_or_local",
                return_value="https://storage/session.pdf",
            ),
            patch.object(uploads, "persist_uploaded_file", return_value="file-1"),
        ):
            result = await uploads.upload_session_export(
                upload, "appointment-1", "Bearer token"
            )

        persisted = fake_db.update_appointment.call_args.args[1]
        self.assertNotIn("sessionNotes", persisted)
        self.assertEqual(persisted["sessionExportUrl"], "https://storage/session.pdf")
        self.assertEqual(persisted["sessionExportFileId"], "file-1")
        self.assertEqual(result["fileRecordId"], "file-1")


if __name__ == "__main__":
    unittest.main()
