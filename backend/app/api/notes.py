"""
Clinical notes API endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime

from app.models import ClinicalNote
from app.db import FirestoreDAO
from app.api.security import require_verified_therapist

router = APIRouter(prefix="/api/notes", tags=["notes"])
db = FirestoreDAO()


class ClinicalNoteRequest(BaseModel):
    patientId: str
    appointmentId: Optional[str] = None
    content: str
    confidential: bool = True
    tags: list = []


def verify_token(authorization: str = Header(...)):
    """Verify Firebase ID token"""
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


@router.get("/{patient_id}")
async def get_patient_notes(
    patient_id: str, authorization: str = Header(...)
):
    """Get clinical notes for a patient"""
    decoded = verify_token(authorization)

    try:
        # Verify patient belongs to therapist
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        if patient.get("therapistUid") != decoded.get("uid"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized",
            )

        notes = db.get_notes_for_patient(patient_id)
        return {
            "status": "success",
            "count": len(notes),
            "notes": notes,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch notes: {str(err)}",
        )


@router.post("/")
async def create_clinical_note(
    request: ClinicalNoteRequest, authorization: str = Header(...)
):
    """Create a clinical note for a patient"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        # Verify patient belongs to therapist
        patient = db.get_patient(request.patientId)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        if patient.get("therapistUid") != therapist_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient does not belong to you",
            )

        note = ClinicalNote(
            id="",
            patientId=request.patientId,
            therapistUid=therapist_uid,
            appointmentId=request.appointmentId,
            content=request.content,
            confidential=request.confidential,
            tags=request.tags,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        note_id = db.create_clinical_note(note)
        return {
            "status": "success",
            "message": "Note created successfully",
            "noteId": note_id,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create note: {str(err)}",
        )
