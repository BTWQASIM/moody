"""
Patient management API endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime

from app.models import PatientProfile, PatientContactInfo, PatientStatus, RiskLevel
from app.db import FirestoreDAO
from app.firebase import get_auth_client, get_db_client
from app.api.security import require_verified_therapist

router = APIRouter(prefix="/api/patients", tags=["patients"])
db = FirestoreDAO()


class PatientRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    firstName: str = Field(min_length=1)
    lastName: str = Field(min_length=1)
    email: str = Field(min_length=1)
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
        require_verified_therapist(decoded)
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
    except HTTPException:
        raise
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


@router.patch("/{patient_id}/link")
async def link_patient_firebase_uid(
    patient_id: str,
    authorization: str = Header(...),
):
    """Link a patient to the mobile account matching their portal email.

    Once linked, the portal can fetch the patient's mood check-ins and journal
    entries written from the mobile app. Firebase UIDs are resolved with the
    Admin SDK and are never required from or exposed to the therapist.
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

        patient_email = str(patient.get("email") or "").strip().lower()
        if not patient_email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Add the patient's mobile login email before linking.",
            )

        auth_client = get_auth_client()
        if not auth_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Firebase Authentication is unavailable.",
            )

        try:
            mobile_account = auth_client.get_user_by_email(patient_email)
        except firebase_auth.UserNotFoundError as err:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"No Moodie mobile account exists for {patient_email}. "
                    "Ask the patient to register or update the patient email."
                ),
            ) from err

        if mobile_account.disabled:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This patient's mobile account is disabled.",
            )

        account_claims = getattr(mobile_account, "custom_claims", None)
        account_role = (
            str(account_claims.get("role") or "").lower()
            if isinstance(account_claims, dict)
            else ""
        )
        if account_role in {"therapist", "admin"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The saved email belongs to a portal account, not a patient mobile account.",
            )

        firebase_uid = mobile_account.uid
        conflicting_links = [
            linked
            for linked in db.find_patients_by_firebase_uid(firebase_uid)
            if str(linked.get("id")) != patient_id
        ]
        if conflicting_links:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This mobile account is already linked to another portal patient.",
            )

        mobile_profile = db.get_mobile_user_profile(firebase_uid)
        if not mobile_profile:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The mobile login exists, but its patient profile is incomplete. "
                    "Ask the patient to sign in and finish registration first."
                ),
            )
        assigned_therapist = str(mobile_profile.get("therapistUid") or "").strip()
        if assigned_therapist and assigned_therapist != decoded.get("uid"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This mobile account is already linked to another therapist.",
            )

        db.link_patient_firebase_uid(
            patient_id,
            firebase_uid,
            decoded.get("uid"),
            previous_firebase_uid=patient.get("firebaseUid"),
        )

        return {
            "status": "success",
            "message": "Patient linked to their Moodie mobile account",
            "patientId": patient_id,
            "mobileAccountEmail": mobile_account.email or patient_email,
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
    """Remove the mobile-account link from both sides of the relationship."""
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

        firebase_uid = str(patient.get("firebaseUid") or "").strip()
        db.unlink_patient_firebase_uid(
            patient_id,
            firebase_uid,
            decoded.get("uid"),
        )
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
