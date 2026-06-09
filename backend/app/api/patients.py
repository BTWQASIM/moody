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

router = APIRouter(prefix="/api/patients", tags=["patients"])
db = FirestoreDAO()


class PatientRequest(BaseModel):
    firstName: str
    lastName: str
    dateOfBirth: str
    email: str
    phone: str
    address: str
    city: str
    state: str
    zipCode: str
    emergencyName: str
    emergencyPhone: str
    emergencyRelation: str
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
    try:
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header",
            )
        token = authorization.split(" ")[1]
        decoded = firebase_auth.verify_id_token(token)
        return decoded
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
        profile = PatientProfile(
            id="",  # Firestore will generate
            therapistUid=therapist_uid,
            firstName=request.firstName,
            lastName=request.lastName,
            dateOfBirth=request.dateOfBirth,
            email=request.email,
            phone=request.phone,
            address=request.address,
            city=request.city,
            state=request.state,
            zipCode=request.zipCode,
            emergencyContact=PatientContactInfo(
                emergencyName=request.emergencyName,
                emergencyPhone=request.emergencyPhone,
                emergencyRelation=request.emergencyRelation,
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
