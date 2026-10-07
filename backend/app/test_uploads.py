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

    def test_validates_real_pdf_and_rejects_spoofed_pdf(self):
        extension, content_type = uploads.validate_credential_document(
            "license.pdf", "application/pdf", b"%PDF-1.7\ncredential"
        )
        self.assertEqual(extension, "pdf")
        self.assertEqual(content_type, "application/pdf")

        with self.assertRaises(HTTPException) as raised:
            uploads.validate_credential_document(
                "license.pdf", "application/pdf", b"not a pdf"
            )
        self.assertEqual(raised.exception.status_code, 400)

    def test_credential_document_is_chunked_in_one_firestore_batch(self):
        fake_db = Mock()
        file_ref = Mock(id="file-1")
        fake_db.collection.return_value.document.return_value = file_ref
        batch = fake_db.batch.return_value
        fake_dao = Mock(db=fake_db)

        with (
            patch.object(uploads, "db", fake_dao),
            patch.object(uploads, "DOCUMENT_CHUNK_BYTES", 4),
        ):
            file_id, file_url, file_path = uploads.persist_credential_document(
                owner_uid="therapist-1",
                document_type="license",
                original_name="license.pdf",
                content_type="application/pdf",
                contents=b"%PDF-12345",
            )

        self.assertEqual(file_id, "file-1")
        self.assertEqual(file_url, "/api/uploads/file/file-1")
        self.assertIn("therapist-1", file_path)
        self.assertEqual(batch.set.call_count, 4)  # metadata + three chunks
        batch.commit.assert_called_once_with()


class CredentialDocumentEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_document_upload_uses_firestore_when_storage_bucket_is_absent(self):
        upload = Mock(
            filename="license.pdf",
            content_type="application/pdf",
            size=24,
        )
        upload.read = AsyncMock(return_value=b"%PDF-1.7\nlicense-data")

        with (
            patch.object(uploads, "verify_token", return_value={"uid": "therapist-1"}),
            patch.object(
                uploads,
                "persist_credential_document",
                return_value=(
                    "file-1",
                    "/api/uploads/file/file-1",
                    "firestoreDocuments/therapist-1/file-1",
                ),
            ) as persist,
            patch.object(uploads, "upload_to_storage_or_local") as storage_upload,
        ):
            result = await uploads.upload_document(
                upload, "license", "Bearer token"
            )

        persist.assert_called_once()
        storage_upload.assert_not_called()
        self.assertEqual(result["fileRecordId"], "file-1")
        self.assertEqual(result["fileUrl"], "/api/uploads/file/file-1")

    async def test_owner_can_view_reassembled_credential_document(self):
        metadata = Mock(exists=True)
        metadata.to_dict.return_value = {
            "ownerUid": "therapist-1",
            "category": "document",
            "storageBackend": "firestore_chunks",
            "chunkCount": 2,
            "size": 11,
            "contentType": "application/pdf",
            "originalName": "license.pdf",
        }
        chunks = []
        for content in (b"%PDF-", b"data!!"):
            snapshot = Mock(exists=True)
            snapshot.to_dict.return_value = {"content": content}
            chunks.append(snapshot)
        chunk_collection = Mock()
        chunk_collection.document.side_effect = [
            Mock(get=Mock(return_value=chunks[0])),
            Mock(get=Mock(return_value=chunks[1])),
        ]
        file_ref = Mock()
        file_ref.get.return_value = metadata
        file_ref.collection.return_value = chunk_collection
        fake_db = Mock()
        fake_db.collection.return_value.document.return_value = file_ref
        fake_dao = Mock(db=fake_db)

        with (
            patch.object(uploads, "db", fake_dao),
            patch.object(uploads, "verify_token", return_value={"uid": "therapist-1"}),
        ):
            response = await uploads.get_uploaded_file("file-1", "Bearer token")

        self.assertEqual(response.body, b"%PDF-data!!")
        self.assertEqual(response.media_type, "application/pdf")


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
