"""Focused regression tests for persistent therapist profile photos."""

import unittest
from io import BytesIO

from fastapi import HTTPException
from PIL import Image

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


if __name__ == "__main__":
    unittest.main()
