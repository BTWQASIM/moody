"""Move recoverable localhost therapist photos into persistent Firestore storage."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = CURRENT_DIR.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env")

from app.api.uploads import normalize_profile_photo
from app.firebase import get_db_client, get_firebase_app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate local therapist photos")
    parser.add_argument("--apply", action="store_true", help="Write updates")
    parser.add_argument(
        "--base-url",
        default=os.getenv("PUBLIC_API_URL", "http://localhost:8000"),
        help="Public backend URL used by mobile clients",
    )
    return parser.parse_args()


def find_local_photo(photo_url: str) -> Path | None:
    path = urlparse(photo_url).path
    marker = "/uploads/"
    if marker not in path:
        return None
    relative = path.split(marker, 1)[1]
    for root in (BACKEND_ROOT / "local-uploads", BACKEND_ROOT / "uploads"):
        candidate = (root / relative).resolve()
        if candidate.is_relative_to(root.resolve()) and candidate.is_file():
            return candidate
    return None


def main() -> int:
    args = parse_args()
    app = get_firebase_app()
    db = get_db_client()
    if not app or not db:
        print("ERROR: Firebase Admin is not configured.")
        return 1

    recoverable = []
    unrecoverable = []
    therapist_docs = list(db.collection("therapists").stream())
    for doc in therapist_docs:
        data = doc.to_dict() or {}
        photo_url = str(data.get("profilePhoto") or "")
        if "localhost" not in photo_url:
            continue
        local_path = find_local_photo(photo_url)
        if local_path:
            try:
                normalized = normalize_profile_photo(local_path.read_bytes())
                recoverable.append((doc, normalized))
            except Exception:
                unrecoverable.append(doc.id)
        else:
            unrecoverable.append(doc.id)

    print(f"Mode: {'APPLY' if args.apply else 'DRY RUN'}")
    print(f"Therapists scanned: {len(therapist_docs)}")
    print(f"Photos recoverable: {len(recoverable)}")
    print(f"Photos unrecoverable: {len(unrecoverable)}")

    if args.apply:
        base_url = args.base_url.rstrip("/")
        for doc, normalized in recoverable:
            version = str(int(datetime.now(timezone.utc).timestamp()))
            db.collection("profilePhotos").document(doc.id).set(
                {
                    "content": normalized,
                    "contentType": "image/jpeg",
                    "updatedAt": datetime.now(timezone.utc),
                }
            )
            doc.reference.update(
                {
                    "profilePhoto": (
                        f"{base_url}/api/uploads/profile-photo/{doc.id}?v={version}"
                    ),
                    "updatedAt": datetime.now(timezone.utc),
                }
            )
        print(f"Photos migrated: {len(recoverable)}")
    elif recoverable:
        print("No writes performed. Re-run with --apply to migrate these photos.")

    if unrecoverable:
        print("Unrecoverable photos require the therapist to upload a new photo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
