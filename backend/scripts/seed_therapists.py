"""
Seed 5 verified therapist accounts for testing.

For each therapist:
  - Creates a Firebase Auth account (email + password)
  - Sets custom claims { role: "therapist", verified: True }
  - Writes a Firestore document in `therapists` with ID TP_001 … TP_005
    (uid field = Firebase Auth UID so the mobile app and portal both resolve correctly)

Run from the backend directory:
    python scripts/seed_therapists.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

from dotenv import load_dotenv

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

load_dotenv(os.path.join(BACKEND_ROOT, ".env"))

from firebase_admin import auth as firebase_auth
from app.firebase import get_firebase_app, get_db_client

# ── Therapist data ────────────────────────────────────────────────────────────

PASSWORD = "Therapist@2026"

THERAPISTS = [
    {
        "doc_id": "TP_001",
        "name": "Dr. Sarah Ahmed",
        "email": "dr.sarah.ahmed@pmt.com",
        "bio": (
            "Specializing in anxiety, stress management, and cognitive "
            "behavioural therapy with 8 years of clinical experience. "
            "Passionate about evidence-based approaches that help clients "
            "build lasting resilience."
        ),
        "qualifications": "Ph.D. Clinical Psychology",
        "licenseNumber": "PSY-00001",
        "phone": "+1-555-0101",
        "yearsOfExperience": 8,
        "specializations": ["Anxiety", "CBT", "Stress Management"],
        "availability": [
            {"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"},
            {"dayOfWeek": 3, "startTime": "10:00", "endTime": "15:00"},
            {"dayOfWeek": 5, "startTime": "09:00", "endTime": "13:00"},
        ],
    },
    {
        "doc_id": "TP_002",
        "name": "Dr. Omar Malik",
        "email": "dr.omar.malik@pmt.com",
        "bio": (
            "Clinical psychologist with 12 years of experience working with "
            "trauma, PTSD, and mood disorders. Uses a trauma-informed, "
            "compassion-focused framework tailored to each individual."
        ),
        "qualifications": "Psy.D. Clinical Psychology",
        "licenseNumber": "PSY-00002",
        "phone": "+1-555-0102",
        "yearsOfExperience": 12,
        "specializations": ["Trauma", "PTSD", "Depression", "Mood Disorders"],
        "availability": [
            {"dayOfWeek": 1, "startTime": "10:00", "endTime": "18:00"},
            {"dayOfWeek": 2, "startTime": "09:00", "endTime": "14:00"},
            {"dayOfWeek": 4, "startTime": "12:00", "endTime": "18:00"},
        ],
    },
    {
        "doc_id": "TP_003",
        "name": "Dr. Aisha Karimi",
        "email": "dr.aisha.karimi@pmt.com",
        "bio": (
            "Licensed therapist with 6 years of practice focused on relationship "
            "therapy, couples counselling, and family systems. Trained in "
            "Emotionally Focused Therapy (EFT) and Gottman Method."
        ),
        "qualifications": "M.S. Marriage & Family Therapy",
        "licenseNumber": "MFT-00003",
        "phone": "+1-555-0103",
        "yearsOfExperience": 6,
        "specializations": ["Couples Therapy", "Family Systems", "EFT", "Relationships"],
        "availability": [
            {"dayOfWeek": 2, "startTime": "11:00", "endTime": "19:00"},
            {"dayOfWeek": 4, "startTime": "09:00", "endTime": "17:00"},
            {"dayOfWeek": 6, "startTime": "09:00", "endTime": "14:00"},
        ],
    },
    {
        "doc_id": "TP_004",
        "name": "Dr. Zain Qureshi",
        "email": "dr.zain.qureshi@pmt.com",
        "bio": (
            "Psychiatrist and therapist with 15 years of experience in ADHD, "
            "OCD, and neurodevelopmental conditions. Integrates medication "
            "management with psychotherapy for holistic care."
        ),
        "qualifications": "M.D. Psychiatry",
        "licenseNumber": "MD-00004",
        "phone": "+1-555-0104",
        "yearsOfExperience": 15,
        "specializations": ["ADHD", "OCD", "Neurodevelopmental", "Psychiatry"],
        "availability": [
            {"dayOfWeek": 1, "startTime": "08:00", "endTime": "12:00"},
            {"dayOfWeek": 3, "startTime": "08:00", "endTime": "16:00"},
            {"dayOfWeek": 5, "startTime": "10:00", "endTime": "16:00"},
        ],
    },
    {
        "doc_id": "TP_005",
        "name": "Dr. Nadia Hassan",
        "email": "dr.nadia.hassan@pmt.com",
        "bio": (
            "Specialist in grief counselling, life transitions, and existential "
            "therapy. 10 years of experience supporting clients through loss, "
            "burnout, identity shifts, and major life changes."
        ),
        "qualifications": "Ph.D. Counselling Psychology",
        "licenseNumber": "PSY-00005",
        "phone": "+1-555-0105",
        "yearsOfExperience": 10,
        "specializations": ["Grief", "Life Transitions", "Burnout", "Existential Therapy"],
        "availability": [
            {"dayOfWeek": 2, "startTime": "09:00", "endTime": "15:00"},
            {"dayOfWeek": 3, "startTime": "13:00", "endTime": "19:00"},
            {"dayOfWeek": 5, "startTime": "09:00", "endTime": "15:00"},
        ],
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_or_create_auth_user(email: str, name: str) -> str:
    """Return existing Firebase Auth UID or create a new account."""
    try:
        user = firebase_auth.get_user_by_email(email)
        print(f"  Auth account already exists  →  UID: {user.uid}")
        return user.uid
    except firebase_auth.UserNotFoundError:
        user = firebase_auth.create_user(
            email=email,
            password=PASSWORD,
            display_name=name,
            email_verified=True,
        )
        print(f"  Auth account created         →  UID: {user.uid}")
        return user.uid


def set_therapist_claims(uid: str) -> None:
    firebase_auth.set_custom_user_claims(uid, {"role": "therapist", "verified": True})


def upsert_firestore(db, doc_id: str, payload: dict) -> None:
    db.collection("therapists").document(doc_id).set(payload, merge=True)


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    app = get_firebase_app()
    db = get_db_client()

    if not app or not db:
        print("ERROR: Firebase Admin is not configured.")
        print("Copy your service-account JSON to web/backend/firebase-adminsdk.json")
        return 1

    now = datetime.utcnow()
    created: list[dict] = []

    print("\n" + "=" * 60)
    print("  Seeding 5 therapist accounts")
    print("=" * 60)

    for t in THERAPISTS:
        print(f"\n[{t['doc_id']}] {t['name']}")

        # 1. Firebase Auth account
        uid = get_or_create_auth_user(t["email"], t["name"])

        # 2. Custom claims (therapist + verified) so portal login works
        set_therapist_claims(uid)
        print(f"  Claims set                   →  role=therapist, verified=True")

        # 3. Firestore document  (doc ID = TP_00x; uid field = Firebase Auth UID)
        payload = {
            "uid": uid,                           # Firebase Auth UID
            "name": t["name"],
            "email": t["email"],
            "phone": t["phone"],
            "bio": t["bio"],
            "qualifications": t["qualifications"],
            "licenseNumber": t["licenseNumber"],
            "yearsOfExperience": t["yearsOfExperience"],
            "specializations": t["specializations"],
            "availability": t["availability"],
            "status": "verified",
            "verified": True,
            "verifiedAt": now,
            "profilePhoto": None,
            "documentUrls": [],
            "createdAt": now,
            "updatedAt": now,
            "role": "therapist",
        }
        upsert_firestore(db, t["doc_id"], payload)
        print(f"  Firestore doc written        →  therapists/{t['doc_id']}")

        created.append({"doc_id": t["doc_id"], "uid": uid, "email": t["email"]})

    # ── Summary table ─────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  DONE — login credentials")
    print("=" * 60)
    print(f"  Password (all accounts):  {PASSWORD}\n")
    print(f"  {'Doc ID':<8}  {'Email':<34}  Firebase Auth UID")
    print(f"  {'-'*7}  {'-'*33}  {'-'*28}")
    for row in created:
        print(f"  {row['doc_id']:<8}  {row['email']:<34}  {row['uid']}")

    print("\n  Tip: log in at http://localhost:3000 with any email above")
    print("       and password:", PASSWORD)
    print("=" * 60 + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
