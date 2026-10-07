"""Backfill portal-created appointments to use Firebase Auth patient UIDs.

Dry-run is the default. Pass --apply to write changes. The migration is
idempotent: after an appointment is updated, its patientId no longer matches a
portal patient document ID and it will not be selected on subsequent runs.
"""

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
    parser = argparse.ArgumentParser(
        description=(
            "Replace portal appointment patient document IDs with linked "
            "Firebase Auth UIDs"
        )
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the updates. Without this flag, only report affected documents.",
    )
    return parser.parse_args()


def linked_patient_ids(patient_docs: list[Any]) -> dict[str, str]:
    """Map portal patient document IDs to non-empty Firebase Auth UIDs."""
    linked: dict[str, str] = {}
    for doc in patient_docs:
        data = doc.to_dict()
        if not isinstance(data, dict):
            continue
        firebase_uid = str(data.get("firebaseUid") or "").strip()
        if firebase_uid:
            linked[str(doc.id)] = firebase_uid
    return linked


def affected_appointments(
    appointment_docs: list[Any], patient_uid_by_portal_id: dict[str, str]
) -> list[tuple[Any, dict[str, Any]]]:
    """Return Firestore snapshots and the minimal update each one needs."""
    affected: list[tuple[Any, dict[str, Any]]] = []
    for doc in appointment_docs:
        data = doc.to_dict()
        if not isinstance(data, dict):
            continue

        portal_patient_id = str(data.get("patientId") or "").strip()
        firebase_uid = patient_uid_by_portal_id.get(portal_patient_id)
        if not firebase_uid:
            continue

        affected.append(
            (
                doc,
                {
                    "patientId": firebase_uid,
                    "portalPatientId": portal_patient_id,
                    "updatedAt": datetime.now(timezone.utc),
                },
            )
        )
    return affected


def apply_updates(db: Any, updates: list[tuple[Any, dict[str, Any]]]) -> None:
    """Commit updates in batches below Firestore's 500-write limit."""
    batch = db.batch()
    writes = 0
    for doc, fields in updates:
        batch.update(doc.reference, fields)
        writes += 1
        if writes == 400:
            batch.commit()
            batch = db.batch()
            writes = 0
    if writes:
        batch.commit()


def main() -> int:
    args = parse_args()
    app = get_firebase_app()
    db = get_db_client()
    if not app or not db:
        print("ERROR: Firebase Admin is not configured.")
        return 1

    patient_docs = list(db.collection("patients").stream())
    appointment_docs = list(db.collection("appointments").stream())
    patient_uid_by_portal_id = linked_patient_ids(patient_docs)
    updates = affected_appointments(appointment_docs, patient_uid_by_portal_id)

    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"Mode: {mode}")
    print(f"Patients scanned: {len(patient_docs)}")
    print(f"Linked patients: {len(patient_uid_by_portal_id)}")
    print(f"Appointments scanned: {len(appointment_docs)}")
    print(f"Appointments affected: {len(updates)}")

    if args.apply and updates:
        apply_updates(db, updates)
        print(f"Appointments updated: {len(updates)}")
    elif not args.apply and updates:
        print("No writes performed. Re-run with --apply to update these documents.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
