"""
Mood entries and tracking API endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header, Query
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime

from app.models import MoodEntry, MoodEntryStatus, RiskLevel
from app.db import FirestoreDAO
from app.api.security import require_verified_therapist

router = APIRouter(prefix="/api/mood", tags=["mood"])
db = FirestoreDAO()


class MoodEntryRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    patientId: str = Field(min_length=1)
    moodScore: int = Field(ge=1, le=10)
    emotionalState: str = Field(min_length=1)
    triggers: list = Field(default_factory=list)
    symptoms: list = Field(default_factory=list)
    notes: str = ""


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


@router.get("/entries/{patient_id}")
async def get_mood_entries(
    patient_id: str,
    authorization: str = Header(...),
    limit: int = Query(30),
):
    """Get mood entries for a patient"""
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

        entries = db.get_mood_entries_for_patient(patient_id, limit)
        return {
            "status": "success",
            "count": len(entries),
            "entries": entries,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch mood entries: {str(err)}",
        )


@router.post("/entries")
async def create_mood_entry(
    request: MoodEntryRequest, authorization: str = Header(...)
):
    """Create a new mood entry"""
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

        # Determine risk level based on mood score
        if request.moodScore <= 3:
            risk_level = RiskLevel.HIGH
        elif request.moodScore <= 5:
            risk_level = RiskLevel.MEDIUM
        else:
            risk_level = RiskLevel.LOW

        entry = MoodEntry(
            id="",
            patientId=request.patientId,
            therapistUid=therapist_uid,
            moodScore=request.moodScore,
            emotionalState=request.emotionalState,
            triggers=request.triggers,
            symptoms=request.symptoms,
            notes=request.notes,
            status=MoodEntryStatus.PENDING_REVIEW,
            riskLevel=risk_level,
            recordedAt=datetime.utcnow(),
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        entry_id = db.create_mood_entry(entry)

        # If high risk, create an alert
        if risk_level == RiskLevel.HIGH:
            from app.models import RiskAlert
            alert = RiskAlert(
                id="",
                patientId=request.patientId,
                therapistUid=therapist_uid,
                title="Low Mood Alert",
                description=f"Patient reported low mood: {request.moodScore}/10",
                riskLevel=RiskLevel.HIGH,
                source="mood_entry",
                isAcknowledged=False,
                createdAt=datetime.utcnow(),
            )
            db.create_risk_alert(alert)

        return {
            "status": "success",
            "message": "Mood entry recorded",
            "entryId": entry_id,
            "riskLevel": risk_level,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create mood entry: {str(err)}",
        )
