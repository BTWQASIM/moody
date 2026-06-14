"""
Patient management API endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime

from app.models import PatientProfile, PatientContactInfo, PatientStatus, RiskLevel
from app.db import FirestoreDAO
from app.firebase import get_auth_client, get_db_client

router = APIRouter(prefix="/api/patients", tags=["patients"])
db = FirestoreDAO()


class PatientRequest(BaseModel):
    firstName: str
    lastName: str
    email: str
    # Everything below is optional for the quick-add form; can be filled in
    # later via the patient profile edit flow.
    phone: Optional[str] = ""
    dateOfBirth: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    zipCode: Optional[str] = ""
    emergencyName: Optional[str] = ""
    emergencyPhone: Optional[str] = ""
    emergencyRelation: Optional[str] = ""
    insuranceProvider: Optional[str] = None
    insuranceMemberId: Optional[str] = None


class PatientUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zipCode: Optional[str] = None
    status: Optional[PatientStatus] = None
    riskLevel: Optional[RiskLevel] = None
    clinicalNotes: Optional[str] = None


def verify_token(authorization: str = Header(...)):
    """Verify Firebase ID token"""
    if not get_auth_client():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Firebase Admin is not configured. "
                "Add firebase-adminsdk.json to web/backend/ and restart the server."
            ),
        )

    try:
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header",
            )
        token = authorization.split(" ")[1]
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(err)}",
        )


@router.get("/")
async def list_patients(authorization: str = Header(...)):
    """List all patients for the authenticated therapist"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        patients = db.get_patients_for_therapist(therapist_uid)
        return {
            "status": "success",
            "count": len(patients),
            "patients": patients,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch patients: {str(err)}",
        )


@router.get("/{patient_id}")
async def get_patient(patient_id: str, authorization: str = Header(...)):
    """Get a specific patient profile"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        patient = db.get_patient(patient_id)
        if not patient:
            # Mobile appointments may link using Firebase Auth UID instead of portal doc ID.
            patient = db.find_patient_by_firebase_uid(therapist_uid, patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Verify therapist owns this patient
        if patient.get("therapistUid") != therapist_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this patient",
            )

        return {"status": "success", "patient": patient}
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch patient: {str(err)}",
        )


@router.post("/")
async def create_patient(
    request: PatientRequest, authorization: str = Header(...)
):
    """Create a new patient profile"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        if not get_db_client():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Firestore is not configured on the backend.",
            )

        profile = PatientProfile(
            id="",  # Firestore will generate
            therapistUid=therapist_uid,
            firstName=request.firstName,
            lastName=request.lastName,
            dateOfBirth=request.dateOfBirth or "",
            email=request.email,
            phone=request.phone or "",
            address=request.address or "",
            city=request.city or "",
            state=request.state or "",
            zipCode=request.zipCode or "",
            emergencyContact=PatientContactInfo(
                emergencyName=request.emergencyName or "",
                emergencyPhone=request.emergencyPhone or "",
                emergencyRelation=request.emergencyRelation or "",
            ),
            insuranceProvider=request.insuranceProvider,
            insuranceMemberId=request.insuranceMemberId,
            status=PatientStatus.PENDING_INTAKE,
            riskLevel=RiskLevel.LOW,
        )

        patient_id = db.create_patient(profile)
        return {
            "status": "success",
            "message": "Patient created successfully",
            "patientId": patient_id,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create patient: {str(err)}",
        )


@router.patch("/{patient_id}")
async def update_patient(
    patient_id: str,
    request: PatientUpdate,
    authorization: str = Header(...),
):
    """Update a patient profile"""
    decoded = verify_token(authorization)

    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Verify therapist owns this patient
        if patient.get("therapistUid") != decoded.get("uid"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this patient",
            )

        # Build update dict with only provided fields
        updates = {k: v for k, v in request.model_dump().items() if v is not None}

        if updates:
            db.update_patient(patient_id, updates)

        return {
            "status": "success",
            "message": "Patient updated successfully",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update patient: {str(err)}",
        )


@router.delete("/{patient_id}")
async def delete_patient(patient_id: str, authorization: str = Header(...)):
    """Deactivate a patient (soft delete)"""
    decoded = verify_token(authorization)

    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Verify therapist owns this patient
        if patient.get("therapistUid") != decoded.get("uid"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this patient",
            )

        db.delete_patient(patient_id)
        return {"status": "success", "message": "Patient deactivated"}
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete patient: {str(err)}",
        )


class LinkFirebaseUidRequest(BaseModel):
    firebaseUid: str


@router.patch("/{patient_id}/link")
async def link_patient_firebase_uid(
    patient_id: str,
    request: LinkFirebaseUidRequest,
    authorization: str = Header(...),
):
    """Link a patient's mobile Firebase Auth UID to their portal record.

    Once linked, the portal can fetch the patient's mood check-ins and journal
    entries written from the mobile app.  The mobile app will also receive the
    therapist's UID on their users/{uid} document so future writes are tagged.
    """
    decoded = verify_token(authorization)

    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        if patient.get("therapistUid") != decoded.get("uid"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this patient",
            )

        firebase_uid = request.firebaseUid.strip()
        if not firebase_uid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="firebaseUid must not be empty",
            )

        db.link_patient_firebase_uid(patient_id, firebase_uid)

        # Propagate therapist UID back to the patient's mobile users/{uid}
        # document so new writes from the mobile app are tagged automatically.
        from firebase_admin import firestore as admin_firestore
        try:
            fs = admin_firestore.client()
            fs.collection("users").document(firebase_uid).set(
                {"therapistUid": decoded.get("uid")},
                merge=True,
            )
        except Exception:
            # Non-fatal: link is stored on the patients doc regardless
            pass

        return {
            "status": "success",
            "message": "Patient linked to Firebase account",
            "patientId": patient_id,
            "firebaseUid": firebase_uid,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to link patient: {str(err)}",
        )


@router.delete("/{patient_id}/link")
async def unlink_patient_firebase_uid(
    patient_id: str, authorization: str = Header(...)
):
    """Remove the Firebase UID link from a patient record."""
    decoded = verify_token(authorization)

    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        if patient.get("therapistUid") != decoded.get("uid"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this patient",
            )

        db.unlink_patient_firebase_uid(patient_id)
        return {"status": "success", "message": "Patient unlinked"}
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unlink patient: {str(err)}",
        )


@router.get("/{patient_id}/mobile-activity")
async def get_patient_mobile_activity(
    patient_id: str,
    limit: int = 30,
    authorization: str = Header(...),
):
    """Return the patient's mood check-ins and journal entries from the mobile app.

    Requires the patient to have a `firebaseUid` set via the /link endpoint.
    Returns the most recent `limit` records from each collection, sorted
    newest-first.
    """
    decoded = verify_token(authorization)

    try:
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        if patient.get("therapistUid") != decoded.get("uid"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this patient",
            )

        firebase_uid = patient.get("firebaseUid")
        if not firebase_uid:
            return {
                "status": "success",
                "linked": False,
                "message": "Patient has not been linked to a mobile account yet.",
                "moodCheckins": [],
                "journalEntries": [],
            }

        mood_checkins = db.get_mobile_mood_checkins(firebase_uid, limit=limit)
        journal_entries = db.get_mobile_journal_entries(
            firebase_uid, limit=limit
        )

        mobile_user = db.get_mobile_user_profile(firebase_uid)

        # Serialize Firestore Timestamps to ISO strings for JSON transport
        def _serialize(rows: list) -> list:
            serialized = []
            for row in rows:
                out: dict = {}
                for k, v in row.items():
                    if hasattr(v, "isoformat"):
                        out[k] = v.isoformat()
                    elif hasattr(v, "timestamp_pb"):  # Firestore Timestamp
                        out[k] = v.isoformat()
                    else:
                        out[k] = v
                serialized.append(out)
            return serialized

        return {
            "status": "success",
            "linked": True,
            "firebaseUid": firebase_uid,
            "mobileUserFound": mobile_user is not None,
            "mobileUserName": mobile_user.get("name") if mobile_user else None,
            "mobileUserEmail": mobile_user.get("email") if mobile_user else None,
            "moodCheckins": _serialize(mood_checkins),
            "journalEntries": _serialize(journal_entries),
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch mobile activity: {str(err)}",
        )
