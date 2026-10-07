"""Seed a rich, reversible portal demo for one existing therapist.

Dry-run is the default. Examples (run from ``backend``):

    python scripts/seed_portal_demo.py
    python scripts/seed_portal_demo.py --apply
    python scripts/seed_portal_demo.py --cleanup --apply

The script creates dedicated, tagged demo patient Auth accounts so appointments
are visible in the mobile app. It never changes the therapist Auth account.
Clinical documents use deterministic ``demo_brock_*`` IDs and carry
``seedTag=brock-portal-demo-v1``. Cleanup deletes only tagged clinical records
and preserves the demo sign-in identities for safe reuse.
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from google.cloud.firestore_v1.base_query import FieldFilter

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

load_dotenv(os.path.join(BACKEND_ROOT, ".env"))

from firebase_admin import auth as firebase_auth

from app.firebase import get_db_client, get_firebase_app


DEFAULT_EMAIL = "brocklesnar@moodie.com"
SEED_TAG = "brock-portal-demo-v1"
ID_PREFIX = "demo_brock_"

PATIENTS = [
    {
        "firstName": "Ayesha",
        "lastName": "Malik",
        "email": "ayesha.malik@moodie.com",
        "legacyEmail": "ayesha.malik.demo@example.com",
        "dateOfBirth": "1995-03-12",
        "status": "active",
        "riskLevel": "low",
        "city": "Lahore",
        "focus": "Work-related anxiety and sleep routine",
        "scores": [5, 6, 7],
    },
    {
        "firstName": "Hamza",
        "lastName": "Khan",
        "email": "hamza.khan@moodie.com",
        "legacyEmail": "hamza.khan.demo@example.com",
        "dateOfBirth": "1991-08-24",
        "status": "active",
        "riskLevel": "medium",
        "city": "Islamabad",
        "focus": "Panic symptoms and avoidance patterns",
        "scores": [4, 5, 6],
    },
    {
        "firstName": "Sara",
        "lastName": "Ahmed",
        "email": "sara.ahmed@moodie.com",
        "legacyEmail": "sara.ahmed.demo@example.com",
        "dateOfBirth": "1998-11-05",
        "status": "active",
        "riskLevel": "high",
        "city": "Faisalabad",
        "focus": "Depressive symptoms and social withdrawal",
        "scores": [2, 3, 4],
    },
    {
        "firstName": "Bilal",
        "lastName": "Raza",
        "email": "bilal.raza@moodie.com",
        "legacyEmail": "bilal.raza.demo@example.com",
        "dateOfBirth": "1987-01-19",
        "status": "active",
        "riskLevel": "low",
        "city": "Karachi",
        "focus": "Stress management and healthy boundaries",
        "scores": [6, 7, 8],
    },
    {
        "firstName": "Mariam",
        "lastName": "Sheikh",
        "email": "mariam.sheikh@moodie.com",
        "legacyEmail": "mariam.sheikh.demo@example.com",
        "dateOfBirth": "1993-06-30",
        "status": "active",
        "riskLevel": "critical",
        "city": "Rawalpindi",
        "focus": "Safety planning and intensive mood monitoring",
        "scores": [1, 2, 3],
    },
    {
        "firstName": "Usman",
        "lastName": "Farooq",
        "email": "usman.farooq@moodie.com",
        "legacyEmail": "usman.farooq.demo@example.com",
        "dateOfBirth": "2000-09-14",
        "status": "pending_intake",
        "riskLevel": "medium",
        "city": "Multan",
        "focus": "Initial assessment for academic burnout",
        "scores": [4, 5, 5],
    },
    {
        "firstName": "Noor",
        "lastName": "Fatima",
        "email": "noor.fatima@moodie.com",
        "legacyEmail": "noor.fatima.demo@example.com",
        "dateOfBirth": "1996-12-02",
        "status": "active",
        "riskLevel": "high",
        "city": "Peshawar",
        "focus": "Trauma recovery and grounding skills",
        "scores": [3, 4, 5],
    },
    {
        "firstName": "Daniyal",
        "lastName": "Iqbal",
        "email": "daniyal.iqbal@moodie.com",
        "legacyEmail": "daniyal.iqbal.demo@example.com",
        "dateOfBirth": "1989-04-21",
        "status": "inactive",
        "riskLevel": "low",
        "city": "Sialkot",
        "focus": "Completed relapse-prevention plan",
        "scores": [7, 8, 8],
    },
]

SERVICES = [
    ("Individual Psychotherapy", "Evidence-based one-to-one therapy", 50, 6000, "Anxiety", "In person / Online"),
    ("Trauma-Focused Therapy", "Structured trauma recovery and stabilization", 60, 7500, "PTSD & Trauma", "In person"),
    ("Initial Clinical Assessment", "Comprehensive intake and treatment planning", 80, 9000, "Assessment", "In person / Online"),
    ("Stress and Burnout Consultation", "Short-term support for stress and burnout", 45, 5000, "Stress Management", "Online"),
    ("Follow-up Session", "Progress review and treatment-plan adjustment", 40, 4500, "Follow-up", "In person / Online"),
]

PROVINCES = {
    "Karachi": "Sindh",
    "Peshawar": "Khyber Pakhtunkhwa",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed a rich therapist portal demo")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Existing therapist email")
    parser.add_argument("--apply", action="store_true", help="Write changes")
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Remove only documents created by this seed instead of upserting them",
    )
    parser.add_argument(
        "--patient-password",
        default=os.getenv("DEMO_PATIENT_PASSWORD"),
        help="Shared login password for demo patients; generated when omitted during --apply",
    )
    return parser.parse_args()


def _metadata(therapist_uid: str, now: datetime) -> dict[str, Any]:
    return {
        "seedTag": SEED_TAG,
        "seedTherapistUid": therapist_uid,
        "seededAt": now,
    }


def build_demo_documents(
    therapist_uid: str,
    therapist_name: str,
    now: datetime,
    patient_uids: dict[str, str] | None = None,
) -> dict[str, dict[str, dict[str, Any]]]:
    """Build deterministic Firestore documents without performing any I/O."""
    documents: dict[str, dict[str, dict[str, Any]]] = {
        collection: {}
        for collection in (
            "patients",
            "appointments",
            "services",
            "moodEntries",
            "clinicalNotes",
            "riskAlerts",
            "notifications",
            "mood_checkins",
            "journal_entries",
            "clincal_summaries",
            "users",
            "onboarding_responses",
        )
    }
    metadata = _metadata(therapist_uid, now)
    resolved_patient_uids = patient_uids or {
        patient["email"]: f"{ID_PREFIX}auth_{index:02d}"
        for index, patient in enumerate(PATIENTS, start=1)
    }

    for service_index, service in enumerate(SERVICES, start=1):
        service_id = f"{ID_PREFIX}service_{service_index:02d}"
        name, description, duration, price, specialization, delivery_mode = service
        documents["services"][service_id] = {
            "id": service_id,
            "therapistUid": therapist_uid,
            "name": name,
            "description": description,
            "duration": duration,
            "price": float(price),
            "specialization": specialization,
            "deliveryMode": delivery_mode,
            "isActive": True,
            "createdAt": now - timedelta(days=240 - service_index),
            "updatedAt": now,
            **metadata,
        }

    for patient_index, patient in enumerate(PATIENTS, start=1):
        patient_id = f"{ID_PREFIX}patient_{patient_index:02d}"
        mobile_uid = resolved_patient_uids[patient["email"]]
        full_name = f"{patient['firstName']} {patient['lastName']}"
        created_at = now - timedelta(days=210 - patient_index * 7)
        last_session = now - timedelta(days=18 - patient_index)

        documents["patients"][patient_id] = {
            "id": patient_id,
            "therapistUid": therapist_uid,
            "firebaseUid": mobile_uid,
            "firstName": patient["firstName"],
            "lastName": patient["lastName"],
            "dateOfBirth": patient["dateOfBirth"],
            "email": patient["email"],
            "phone": f"+92-300-555-{patient_index:04d}",
            "address": f"House {20 + patient_index}, Garden Street",
            "city": patient["city"],
            "state": PROVINCES.get(patient["city"], "Punjab"),
            "zipCode": f"{38000 + patient_index}",
            "emergencyContact": {
                "emergencyName": f"Emergency Contact {patient_index}",
                "emergencyPhone": f"+92-301-555-{patient_index:04d}",
                "emergencyRelation": "Sibling",
            },
            "insuranceProvider": "Sehat Health Plan",
            "insuranceMemberId": f"SHP-{patient_index:05d}",
            "status": patient["status"],
            "intakeDate": created_at + timedelta(days=2),
            "lastSessionDate": last_session,
            "clinicalNotes": patient["focus"],
            "medicalHistory": "No significant medical history reported.",
            "currentMedications": "Reviewed with patient; see clinical notes.",
            "sessionCount": 3,
            "riskLevel": patient["riskLevel"],
            "createdAt": created_at,
            "updatedAt": now,
            **metadata,
        }

        documents["users"][mobile_uid] = {
            "uid": mobile_uid,
            "name": full_name,
            "email": patient["email"],
            "age": str(max(18, now.year - int(patient["dateOfBirth"][:4]))),
            "occupation": "Professional",
            "onboarding_complete": True,
            "therapistUid": therapist_uid,
            "createdAt": created_at,
            "updatedAt": now,
            **metadata,
        }

        documents["onboarding_responses"][mobile_uid] = {
            "uid": mobile_uid,
            "therapistUid": therapist_uid,
            "answers": {
                "answer1": patient["focus"],
                "answer2": "Build consistent coping skills and monitor progress.",
                "additional_context": "Patient is linked to Dr Brock Lesnar for ongoing care.",
            },
            "timestamp": created_at,
            **metadata,
        }

        completed_appointment_ids: list[str] = []
        for appointment_index, days_ago in enumerate((155, 92, 29), start=1):
            appointment_id = (
                f"{ID_PREFIX}appointment_{patient_index:02d}_{appointment_index:02d}"
            )
            completed_appointment_ids.append(appointment_id)
            scheduled_at = now - timedelta(
                days=days_ago - patient_index * 2,
                hours=patient_index % 4,
            )
            documents["appointments"][appointment_id] = {
                "therapistUid": therapist_uid,
                "therapistName": therapist_name,
                "patientId": mobile_uid,
                "portalPatientId": patient_id,
                "patientName": full_name,
                "patientEmail": patient["email"],
                "scheduledAt": scheduled_at,
                "duration": 50,
                "type": "individual",
                "status": "completed",
                "notes": f"Session {appointment_index}: {patient['focus']}",
                "sessionNotes": "Reviewed goals, coping practice, and between-session plan.",
                "moodBefore": max(1, patient["scores"][max(0, appointment_index - 1)] - 1),
                "moodAfter": min(10, patient["scores"][max(0, appointment_index - 1)] + 1),
                "completedAt": scheduled_at + timedelta(minutes=50),
                "source": "portal",
                "createdAt": scheduled_at - timedelta(days=7),
                "updatedAt": scheduled_at + timedelta(minutes=50),
                **metadata,
            }

        upcoming_id = f"{ID_PREFIX}appointment_{patient_index:02d}_04"
        upcoming_status = "confirmed" if patient_index % 2 else "pending"
        documents["appointments"][upcoming_id] = {
            "therapistUid": therapist_uid,
            "therapistName": therapist_name,
            "patientId": mobile_uid,
            "portalPatientId": patient_id,
            "patientName": full_name,
            "patientEmail": patient["email"],
            "scheduledAt": now + timedelta(days=patient_index, hours=patient_index % 3),
            "duration": 50,
            "type": "follow-up",
            "status": upcoming_status,
            "notes": "Review weekly goals and recent mood pattern.",
            "source": "portal",
            "createdAt": now - timedelta(days=5),
            "updatedAt": now,
            **metadata,
        }

        if patient_index <= 4:
            cancelled_id = f"{ID_PREFIX}appointment_{patient_index:02d}_05"
            documents["appointments"][cancelled_id] = {
                "therapistUid": therapist_uid,
                "therapistName": therapist_name,
                "patientId": mobile_uid,
                "portalPatientId": patient_id,
                "patientName": full_name,
                "patientEmail": patient["email"],
                "scheduledAt": now - timedelta(days=12 + patient_index),
                "duration": 50,
                "type": "follow-up",
                "status": "cancelled",
                "notes": "Cancelled with notice; follow-up rescheduled.",
                "source": "portal",
                "createdAt": now - timedelta(days=25),
                "updatedAt": now - timedelta(days=13),
                **metadata,
            }

        for entry_index, score in enumerate(patient["scores"], start=1):
            recorded_at = now - timedelta(days=(4 - entry_index) * 6 + patient_index)
            mood_id = f"{ID_PREFIX}mood_{patient_index:02d}_{entry_index:02d}"
            risk = "high" if score <= 3 else "medium" if score <= 5 else "low"
            documents["moodEntries"][mood_id] = {
                "id": mood_id,
                "patientId": patient_id,
                "therapistUid": therapist_uid,
                "moodScore": score,
                "emotionalState": "distressed" if score <= 3 else "anxious" if score <= 5 else "stable",
                "triggers": ["sleep", "workload"] if score <= 5 else ["daily routine"],
                "symptoms": ["worry", "fatigue"] if score <= 5 else ["mild tension"],
                "notes": f"Structured check-in {entry_index}; discussed {patient['focus'].lower()}.",
                "status": "reviewed" if entry_index < 3 else "pending_review",
                "riskLevel": risk,
                "recordedAt": recorded_at,
                "createdAt": recorded_at,
                "updatedAt": now,
                **metadata,
            }
            checkin_id = f"{ID_PREFIX}checkin_{patient_index:02d}_{entry_index:02d}"
            documents["mood_checkins"][checkin_id] = {
                "userId": mobile_uid,
                "therapistUid": therapist_uid,
                "moods": ["Low" if score <= 3 else "Anxious" if score <= 5 else "Calm"],
                "moodScore": score,
                "note": f"Mobile check-in reflecting score {score}/10.",
                "timestamp": recorded_at,
                **metadata,
            }

        for note_index, appointment_id in enumerate(completed_appointment_ids[-2:], start=1):
            note_id = f"{ID_PREFIX}note_{patient_index:02d}_{note_index:02d}"
            documents["clinicalNotes"][note_id] = {
                "id": note_id,
                "patientId": patient_id,
                "therapistUid": therapist_uid,
                "appointmentId": appointment_id,
                "content": (
                    f"{full_name} reviewed {patient['focus'].lower()}. "
                    "Progress, barriers, safety, and the next measurable goal were documented."
                ),
                "confidential": True,
                "tags": ["progress", "treatment-plan"],
                "createdAt": now - timedelta(days=36 - note_index * 12 + patient_index),
                "updatedAt": now,
                **metadata,
            }

        for journal_index in range(1, 3):
            journal_id = f"{ID_PREFIX}journal_{patient_index:02d}_{journal_index:02d}"
            documents["journal_entries"][journal_id] = {
                "userId": mobile_uid,
                "therapistUid": therapist_uid,
                "entry": (
                    "I noticed the trigger earlier and used the breathing and grounding plan. "
                    f"Reflection {journal_index} focused on {patient['focus'].lower()}."
                ),
                "prompt": "What helped you respond differently today?",
                "timestamp": now - timedelta(days=journal_index * 5 + patient_index),
                **metadata,
            }

        summary_id = f"{ID_PREFIX}summary_{patient_index:02d}"
        documents["clincal_summaries"][summary_id] = {
            "appointmentID": completed_appointment_ids[-1],
            "patientID": patient_id,
            "firebasePatientId": mobile_uid,
            "therapistID": therapist_uid,
            "generatedNotes": (
                f"Clinical summary for {full_name}: treatment addressed {patient['focus'].lower()}. "
                "The patient practised assigned coping skills and agreed to continue structured monitoring."
            ),
            "reviewedAndSigned": True,
            "timestamp": now - timedelta(days=28 - patient_index),
            "taskID": f"{ID_PREFIX}task_{patient_index:02d}",
            **metadata,
        }

        if patient["riskLevel"] != "low":
            alert_id = f"{ID_PREFIX}alert_{patient_index:02d}"
            documents["riskAlerts"][alert_id] = {
                "id": alert_id,
                "patientId": patient_id,
                "therapistUid": therapist_uid,
                "patientName": full_name,
                "title": f"{patient['riskLevel'].title()} risk review",
                "description": f"Review recent mood trend and {patient['focus'].lower()}.",
                "riskLevel": patient["riskLevel"],
                "source": "mood_entry",
                "isAcknowledged": False,
                "createdAt": now - timedelta(hours=patient_index * 5),
                **metadata,
            }
            notification_id = f"{ID_PREFIX}notification_risk_{patient_index:02d}"
            documents["notifications"][notification_id] = {
                "id": notification_id,
                "userId": therapist_uid,
                "type": "risk_alert",
                "title": f"Risk update for {full_name}",
                "message": f"A {patient['riskLevel']} risk trend requires clinical review.",
                "relatedId": alert_id,
                "isRead": False,
                "readAt": None,
                "createdAt": now - timedelta(hours=patient_index * 5),
                **metadata,
            }

    for reminder_index in range(1, 4):
        notification_id = f"{ID_PREFIX}notification_appointment_{reminder_index:02d}"
        documents["notifications"][notification_id] = {
            "id": notification_id,
            "userId": therapist_uid,
            "type": "appointment_reminder",
            "title": "Upcoming appointment",
            "message": f"Appointment {reminder_index} is scheduled within the next week.",
            "relatedId": f"{ID_PREFIX}appointment_{reminder_index:02d}_04",
            "isRead": reminder_index == 3,
            "readAt": now - timedelta(hours=2) if reminder_index == 3 else None,
            "createdAt": now - timedelta(hours=reminder_index),
            **metadata,
        }

    return documents


def dataset_counts(documents: dict[str, dict[str, dict[str, Any]]]) -> Counter:
    return Counter({collection: len(rows) for collection, rows in documents.items()})


def validate_dataset(
    documents: dict[str, dict[str, dict[str, Any]]], therapist_uid: str
) -> None:
    patient_ids = set(documents["patients"])
    mobile_uids = {
        row["firebaseUid"] for row in documents["patients"].values()
    }
    for collection, rows in documents.items():
        for doc_id, payload in rows.items():
            is_patient_identity_doc = collection in {"users", "onboarding_responses"}
            if not doc_id.startswith(ID_PREFIX) and not (
                is_patient_identity_doc and doc_id in mobile_uids
            ):
                raise ValueError(f"Unsafe document ID outside seed prefix: {doc_id}")
            if payload.get("seedTag") != SEED_TAG:
                raise ValueError(f"Missing seed tag: {collection}/{doc_id}")
            owner = payload.get("therapistUid") or payload.get("therapistID") or payload.get("userId")
            if collection != "notifications" and owner != therapist_uid:
                raise ValueError(f"Wrong therapist owner: {collection}/{doc_id}")
            if collection == "notifications" and payload.get("userId") != therapist_uid:
                raise ValueError(f"Wrong notification owner: {doc_id}")

    for appointment in documents["appointments"].values():
        if appointment["portalPatientId"] not in patient_ids:
            raise ValueError("Appointment references an unknown portal patient")
        if appointment["patientId"] not in mobile_uids:
            raise ValueError("Appointment references an unknown mobile patient")

    if set(documents["users"]) != mobile_uids:
        raise ValueError("Patient Auth UIDs do not match users documents")
    if set(documents["onboarding_responses"]) != mobile_uids:
        raise ValueError("Patient Auth UIDs do not match onboarding documents")


def inspect_patient_auth_users(
    db: Any,
) -> tuple[dict[str, str], list[dict[str, Any]], int]:
    """Find seed-owned patient accounts without adopting unrelated identities."""
    patient_uids: dict[str, str] = {}
    missing: list[dict[str, Any]] = []
    legacy_count = 0
    for patient in PATIENTS:
        email = patient["email"]
        try:
            user = firebase_auth.get_user_by_email(email)
        except firebase_auth.UserNotFoundError:
            legacy_email = patient.get("legacyEmail")
            if legacy_email:
                try:
                    user = firebase_auth.get_user_by_email(legacy_email)
                    legacy_count += 1
                except firebase_auth.UserNotFoundError:
                    missing.append(patient)
                    continue
            else:
                missing.append(patient)
                continue

        profile = db.collection("users").document(user.uid).get()
        profile_data = profile.to_dict() if profile.exists else None
        if not profile_data or profile_data.get("seedTag") != SEED_TAG:
            raise ValueError(
                f"Refusing to reuse untagged Firebase Auth account: {email}"
            )
        patient_uids[email] = user.uid
    return patient_uids, missing, legacy_count


def ensure_patient_auth_users(
    db: Any,
    therapist_uid: str,
    now: datetime,
    password: str,
) -> tuple[dict[str, str], int]:
    """Create missing seed accounts and refresh credentials only for tagged accounts."""
    if len(password) < 8:
        raise ValueError("The demo patient password must contain at least 8 characters")

    patient_uids, missing, _ = inspect_patient_auth_users(db)
    missing_emails = {patient["email"] for patient in missing}
    created = 0

    for patient in PATIENTS:
        email = patient["email"]
        full_name = f"{patient['firstName']} {patient['lastName']}"
        if email not in missing_emails:
            uid = patient_uids[email]
            firebase_auth.update_user(
                uid,
                email=email,
                password=password,
                display_name=full_name,
                email_verified=True,
                disabled=False,
            )
            continue

        user = firebase_auth.create_user(
            email=email,
            password=password,
            display_name=full_name,
            email_verified=True,
            disabled=False,
        )
        try:
            # Tag immediately so an interrupted run remains safely resumable.
            db.collection("users").document(user.uid).set(
                {
                    "uid": user.uid,
                    "name": full_name,
                    "email": email,
                    "therapistUid": therapist_uid,
                    "seedTag": SEED_TAG,
                    "seedTherapistUid": therapist_uid,
                    "seededAt": now,
                },
                merge=True,
            )
        except Exception:
            firebase_auth.delete_user(user.uid)
            raise
        patient_uids[email] = user.uid
        created += 1

    return patient_uids, created


def resolve_therapist(db: Any, email: str) -> tuple[str, str]:
    try:
        user = firebase_auth.get_user_by_email(email)
    except firebase_auth.UserNotFoundError as exc:
        raise ValueError(f"No Firebase Auth user exists for {email}") from exc

    candidates = list(
        db.collection("therapists")
        .where(filter=FieldFilter("uid", "==", user.uid))
        .limit(2)
        .stream()
    )
    direct = db.collection("therapists").document(user.uid).get()
    if direct.exists and all(candidate.id != direct.id for candidate in candidates):
        candidates.append(direct)

    if not candidates:
        candidates = list(
            db.collection("therapists")
            .where(filter=FieldFilter("email", "==", email))
            .limit(2)
            .stream()
        )
    if not candidates:
        raise ValueError(f"No therapist profile exists for {email}")

    profile = candidates[0].to_dict() or {}
    profile_uid = str(profile.get("uid") or user.uid)
    if profile_uid != user.uid:
        raise ValueError("Therapist profile UID does not match the Firebase Auth UID")
    name = str(profile.get("name") or user.display_name or email.split("@", 1)[0])
    return user.uid, name


def apply_documents(db: Any, documents: dict[str, dict[str, dict[str, Any]]]) -> int:
    batch = db.batch()
    writes = 0
    for collection, rows in documents.items():
        for doc_id, payload in rows.items():
            batch.set(db.collection(collection).document(doc_id), payload, merge=True)
            writes += 1
            if writes % 400 == 0:
                batch.commit()
                batch = db.batch()
    if writes % 400:
        batch.commit()
    return writes


def verify_applied_documents(
    db: Any,
    documents: dict[str, dict[str, dict[str, Any]]],
) -> int:
    """Verify every expected tagged document and its patient identity links."""
    expected = {
        f"{collection}/{doc_id}": payload
        for collection, rows in documents.items()
        for doc_id, payload in rows.items()
    }
    refs = [db.document(path) for path in expected]
    snapshots = {snapshot.reference.path: snapshot for snapshot in db.get_all(refs)}

    for path, payload in expected.items():
        snapshot = snapshots.get(path)
        if snapshot is None or not snapshot.exists:
            raise ValueError(f"Post-seed verification missing document: {path}")
        actual = snapshot.to_dict() or {}
        if actual.get("seedTag") != SEED_TAG:
            raise ValueError(f"Post-seed verification found wrong tag: {path}")
        if path.startswith("appointments/"):
            if actual.get("patientId") != payload.get("patientId"):
                raise ValueError(f"Appointment has wrong Firebase patient UID: {path}")
            if actual.get("portalPatientId") != payload.get("portalPatientId"):
                raise ValueError(f"Appointment has wrong portal patient ID: {path}")

    for uid, profile in documents["users"].items():
        auth_user = firebase_auth.get_user(uid)
        if auth_user.email != profile["email"]:
            raise ValueError(f"Auth email mismatch for demo patient UID: {uid}")

    return len(expected)


def cleanup_documents(
    db: Any,
    documents: dict[str, dict[str, dict[str, Any]]],
    preserve_patient_identities: bool = True,
) -> tuple[int, int]:
    """Delete only deterministic documents that still carry this seed's tag."""
    batch = db.batch()
    deleted = 0
    skipped = 0
    for collection, rows in documents.items():
        if preserve_patient_identities and collection in {
            "users",
            "onboarding_responses",
        }:
            continue
        for doc_id in rows:
            ref = db.collection(collection).document(doc_id)
            snapshot = ref.get()
            payload = snapshot.to_dict() if snapshot.exists else None
            if not payload:
                continue
            if payload.get("seedTag") != SEED_TAG:
                skipped += 1
                continue
            batch.delete(ref)
            deleted += 1
            if deleted % 400 == 0:
                batch.commit()
                batch = db.batch()
    if deleted % 400:
        batch.commit()
    return deleted, skipped


def print_plan(
    email: str,
    therapist_uid: str,
    therapist_name: str,
    documents: dict[str, dict[str, dict[str, Any]]],
    mode: str,
    missing_auth_accounts: int,
    legacy_auth_accounts: int,
) -> None:
    print(f"Mode: {mode}")
    print(f"Therapist: {therapist_name} <{email}>")
    print(f"Firebase UID: {therapist_uid}")
    print(f"Seed tag: {SEED_TAG}")
    print(f"Demo patient Auth accounts to create: {missing_auth_accounts}")
    print(f"Legacy patient emails to migrate: {legacy_auth_accounts}")
    print("Documents:")
    for collection, count in sorted(dataset_counts(documents).items()):
        print(f"  {collection}: {count}")
    print(f"  TOTAL: {sum(dataset_counts(documents).values())}")


def main() -> int:
    args = parse_args()
    app = get_firebase_app()
    db = get_db_client()
    if not app or not db:
        print("ERROR: Firebase Admin is not configured.")
        return 1

    try:
        therapist_uid, therapist_name = resolve_therapist(db, args.email.strip())
        now = datetime.now(timezone.utc)
        patient_uids, missing_patients, legacy_count = inspect_patient_auth_users(db)
        missing_count = len(missing_patients)
        login_password: str | None = None

        if args.apply and not args.cleanup:
            login_password = args.patient_password or (
                f"MoodieDemo!{secrets.token_hex(5)}"
            )
            patient_uids, _ = ensure_patient_auth_users(
                db,
                therapist_uid,
                now,
                login_password,
            )
        else:
            for index, patient in enumerate(PATIENTS, start=1):
                patient_uids.setdefault(
                    patient["email"],
                    f"{ID_PREFIX}pending_auth_{index:02d}",
                )

        documents = build_demo_documents(
            therapist_uid,
            therapist_name,
            now,
            patient_uids,
        )
        validate_dataset(documents, therapist_uid)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1

    mode = "CLEANUP" if args.cleanup else "APPLY" if args.apply else "DRY RUN"
    print_plan(
        args.email,
        therapist_uid,
        therapist_name,
        documents,
        mode,
        missing_count,
        legacy_count,
    )

    if not args.apply:
        print("No writes performed. Re-run with --apply after reviewing this plan.")
        return 0

    if args.cleanup:
        deleted, skipped = cleanup_documents(db, documents)
        print(f"Cleanup complete. Deleted: {deleted}; skipped due to tag mismatch: {skipped}")
        print("Tagged demo patient login accounts were preserved for safe reuse.")
        return 0

    writes = apply_documents(db, documents)
    print(f"Seed complete. Documents created or refreshed: {writes}")
    verified = verify_applied_documents(db, documents)
    print(f"Post-seed verification passed: {verified} documents and 8 Auth links")
    print("Demo patient app credentials:")
    for patient in PATIENTS:
        print(f"  {patient['email']}  password={login_password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
