"""Backfill missing therapistName values on existing appointments."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

load_dotenv(os.path.join(BACKEND_ROOT, ".env"))

from app.firebase import get_db_client, get_firebase_app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill appointment therapist names")
    parser.add_argument("--apply", action="store_true", help="Write updates")
    return parser.parse_args()


def therapist_names(therapist_docs: list[Any]) -> dict[str, str]:
    names: dict[str, str] = {}
    for doc in therapist_docs:
        data = doc.to_dict() or {}
        name = str(data.get("name") or "").strip()
        if not name:
            continue
        names[str(doc.id)] = name
        uid = str(data.get("uid") or "").strip()
        if uid:
            names[uid] = name
    return names


def main() -> int:
    args = parse_args()
    app = get_firebase_app()
    db = get_db_client()
    if not app or not db:
        print("ERROR: Firebase Admin is not configured.")
        return 1

    names = therapist_names(list(db.collection("therapists").stream()))
    updates = []
    appointments = list(db.collection("appointments").stream())
    for doc in appointments:
        data = doc.to_dict() or {}
        if str(data.get("therapistName") or "").strip():
            continue
        name = names.get(str(data.get("therapistUid") or ""))
        if name:
            updates.append((doc.reference, name))

    print(f"Mode: {'APPLY' if args.apply else 'DRY RUN'}")
    print(f"Appointments scanned: {len(appointments)}")
    print(f"Appointments affected: {len(updates)}")

    if args.apply:
        for ref, name in updates:
            ref.update(
                {"therapistName": name, "updatedAt": datetime.now(timezone.utc)}
            )
        print(f"Appointments updated: {len(updates)}")
    elif updates:
        print("No writes performed. Re-run with --apply to update these documents.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
