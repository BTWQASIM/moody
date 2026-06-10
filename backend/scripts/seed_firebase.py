"""Seed Firebase Firestore with starter data for local development."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta

from dotenv import load_dotenv

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

load_dotenv(os.path.join(BACKEND_ROOT, ".env"))

from app.firebase import get_firebase_app, get_db_client


def upsert_document(db, collection: str, doc_id: str, payload: dict) -> None:
    db.collection(collection).document(doc_id).set(payload, merge=True)


def main() -> int:
    app = get_firebase_app()
    db = get_db_client()

    if not app or not db:
        print("Firebase Admin is not configured.")
        print("Set FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON in backend/.env first.")
        return 1

    now = datetime.utcnow()
    therapist_uid = "therapist_demo_001"
    patient_1_id = "patient_demo_001"
    patient_2_id = "patient_demo_002"
    service_1_id = "service_demo_001"
    service_2_id = "service_demo_002"
    appointment_1_id = "appointment_demo_001"
    appointment_2_id = "appointment_demo_002"
    mood_1_id = "mood_demo_001"
    mood_2_id = "mood_demo_002"
    alert_id = "risk_alert_demo_001"
    notification_id = "notification_demo_001"

    upsert_document(
        db,
        "therapists",
        therapist_uid,
        {
            "uid": therapist_uid,
            "name": "Dr. Sarah Khan",
            "email": "sarah.khan@pingmytherapist.com",
            "phone": "+1-555-0123",
            "qualifications": "PhD Clinical Psychology",
            "licenseNumber": "PSY-445892-CA",
            "yearsOfExperience": 9,
            "bio": "Focuses on anxiety, trauma, and mood stabilization.",
            "specializations": ["Anxiety", "Trauma", "Depression"],
            "status": "verified",
            "verified": True,
            "verifiedAt": now,
            "createdAt": now,
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "patients",
        patient_1_id,
        {
            "id": patient_1_id,
            "therapistUid": therapist_uid,
            "firstName": "Amina",
            "lastName": "Rashid",
            "dateOfBirth": "1997-04-15",
            "email": "amina.rashid@example.com",
            "phone": "+1-555-1001",
            "address": "12 Bayview Street",
            "city": "San Diego",
            "state": "CA",
            "zipCode": "92101",
            "emergencyContact": {
                "emergencyName": "Omar Rashid",
                "emergencyPhone": "+1-555-7711",
                "emergencyRelation": "Brother",
            },
            "insuranceProvider": "Blue Shield",
            "insuranceMemberId": "BS-2200193",
            "status": "active",
            "intakeDate": now - timedelta(days=35),
            "lastSessionDate": now - timedelta(days=3),
            "clinicalNotes": "Responding well to CBT exercises.",
            "medicalHistory": "No major medical history reported.",
            "currentMedications": "Sertraline 25mg",
            "sessionCount": 6,
            "riskLevel": "medium",
            "createdAt": now - timedelta(days=45),
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "patients",
        patient_2_id,
        {
            "id": patient_2_id,
            "therapistUid": therapist_uid,
            "firstName": "Hassan",
            "lastName": "Ali",
            "dateOfBirth": "1989-11-03",
            "email": "hassan.ali@example.com",
            "phone": "+1-555-1002",
            "address": "449 Cedar Avenue",
            "city": "Los Angeles",
            "state": "CA",
            "zipCode": "90017",
            "emergencyContact": {
                "emergencyName": "Nadia Ali",
                "emergencyPhone": "+1-555-7722",
                "emergencyRelation": "Spouse",
            },
            "insuranceProvider": "Aetna",
            "insuranceMemberId": "AE-449021",
            "status": "active",
            "intakeDate": now - timedelta(days=18),
            "lastSessionDate": now - timedelta(days=6),
            "clinicalNotes": "Sleep hygiene plan introduced.",
            "medicalHistory": "Mild hypertension managed by PCP.",
            "currentMedications": "None",
            "sessionCount": 3,
            "riskLevel": "low",
            "createdAt": now - timedelta(days=24),
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "services",
        service_1_id,
        {
            "id": service_1_id,
            "therapistUid": therapist_uid,
            "name": "Individual Therapy",
            "description": "One-on-one 50-minute therapy session",
            "duration": 50,
            "price": 140.0,
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "services",
        service_2_id,
        {
            "id": service_2_id,
            "therapistUid": therapist_uid,
            "name": "Initial Assessment",
            "description": "Comprehensive intake and clinical assessment",
            "duration": 80,
            "price": 220.0,
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "appointments",
        appointment_1_id,
        {
            "therapistUid": therapist_uid,
            "patientId": patient_1_id,
            "scheduledAt": now + timedelta(days=2),
            "duration": 50,
            "type": "individual",
            "status": "confirmed",
            "notes": "Focus on cognitive restructuring",
            "createdAt": now,
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "appointments",
        appointment_2_id,
        {
            "therapistUid": therapist_uid,
            "patientId": patient_2_id,
            "scheduledAt": now + timedelta(days=4),
            "duration": 50,
            "type": "individual",
            "status": "pending",
            "notes": "Review sleep logs",
            "createdAt": now,
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "moodEntries",
        mood_1_id,
        {
            "id": mood_1_id,
            "patientId": patient_1_id,
            "therapistUid": therapist_uid,
            "moodScore": 4,
            "emotionalState": "anxious",
            "triggers": ["workload", "sleep disruption"],
            "symptoms": ["restlessness", "worry"],
            "notes": "Anxiety spike in late evening.",
            "status": "pending_review",
            "riskLevel": "medium",
            "recordedAt": now - timedelta(days=1),
            "createdAt": now - timedelta(days=1),
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "moodEntries",
        mood_2_id,
        {
            "id": mood_2_id,
            "patientId": patient_2_id,
            "therapistUid": therapist_uid,
            "moodScore": 7,
            "emotionalState": "stable",
            "triggers": ["family visit"],
            "symptoms": ["mild fatigue"],
            "notes": "Energy and mood improving this week.",
            "status": "reviewed",
            "riskLevel": "low",
            "recordedAt": now - timedelta(days=2),
            "createdAt": now - timedelta(days=2),
            "updatedAt": now,
        },
    )

    upsert_document(
        db,
        "riskAlerts",
        alert_id,
        {
            "id": alert_id,
            "patientId": patient_1_id,
            "therapistUid": therapist_uid,
            "title": "Elevated Anxiety Pattern",
            "description": "Consecutive low mood scores and anxiety notes detected.",
            "riskLevel": "medium",
            "source": "mood_entry",
            "isAcknowledged": False,
            "createdAt": now,
        },
    )

    upsert_document(
        db,
        "notifications",
        notification_id,
        {
            "id": notification_id,
            "userId": therapist_uid,
            "type": "risk_alert",
            "title": "Risk Alert for Amina Rashid",
            "message": "A new medium-risk trend has been detected.",
            "relatedId": alert_id,
            "isRead": False,
            "createdAt": now,
        },
    )

    print("Firebase seed complete.")
    print("Created/updated therapist, 2 patients, 2 services, 2 appointments, 2 mood entries, 1 alert, 1 notification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
