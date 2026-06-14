"""
Appointment management API endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header, Query
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime

from app.models import AppointmentDetails, AppointmentStatus
from app.db import FirestoreDAO

router = APIRouter(prefix="/api/appointments", tags=["appointments"])
db = FirestoreDAO()


class AppointmentRequest(BaseModel):
    patientId: str
    scheduledAt: datetime
    duration: int  # minutes
    type: str = "individual"  # individual, couples, group
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    status: Optional[AppointmentStatus] = None
    scheduledAt: Optional[datetime] = None
    duration: Optional[int] = None
    notes: Optional[str] = None
    sessionNotes: Optional[str] = None
    moodBefore: Optional[int] = None
    moodAfter: Optional[int] = None


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
async def list_appointments(
    authorization: str = Header(...),
    start_date: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
):
    """List appointments for the therapist"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        start_dt = None
        if start_date:
            start_dt = datetime.fromisoformat(start_date)

        if patient_id:
            appointments = db.get_appointments_for_patient(patient_id)
            aliases = db._therapist_uid_aliases(therapist_uid)
            appointments = [
                a for a in appointments if a.get("therapistUid") in aliases
            ]
            appointments = db.enrich_appointments_with_patient_refs(
                therapist_uid, appointments
            )
        else:
            appointments = db.get_appointments_for_therapist(therapist_uid, start_dt)

        appointments = db.enrich_appointments_with_patient_refs(
            therapist_uid, appointments
        )

        return {
            "status": "success",
            "count": len(appointments),
            "appointments": appointments,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch appointments: {str(err)}",
        )


@router.get("/{appointment_id}")
async def get_appointment(appointment_id: str, authorization: str = Header(...)):
    """Get a specific appointment"""
    decoded = verify_token(authorization)

    try:
        appointment = db.get_appointment(appointment_id)
        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment not found",
            )

        therapist_uid = decoded.get("uid")
        aliases = db._therapist_uid_aliases(therapist_uid)
        if appointment.get("therapistUid") not in aliases:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this appointment",
            )

        enriched = db.enrich_appointments_with_patient_refs(
            therapist_uid, [appointment]
        )
        appointment = enriched[0] if enriched else appointment

        return {"status": "success", "appointment": appointment}
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch appointment: {str(err)}",
        )


@router.post("/")
async def create_appointment(
    request: AppointmentRequest, authorization: str = Header(...)
):
    """Create a new appointment"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        # Verify patient exists and belongs to therapist
        patient = db.get_patient(request.patientId)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        if patient.get("therapistUid") != therapist_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This patient does not belong to you",
            )

        appointment = AppointmentDetails(
            therapistUid=therapist_uid,
            patientId=request.patientId,
            scheduledAt=request.scheduledAt,
            duration=request.duration,
            type=request.type,
            notes=request.notes,
            status=AppointmentStatus.PENDING,
        )

        appointment_id = db.create_appointment(appointment)
        return {
            "status": "success",
            "message": "Appointment created successfully",
            "appointmentId": appointment_id,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create appointment: {str(err)}",
        )


@router.patch("/{appointment_id}")
async def update_appointment(
    appointment_id: str,
    request: AppointmentUpdate,
    authorization: str = Header(...),
):
    """Update an appointment"""
    decoded = verify_token(authorization)

    try:
        appointment = db.get_appointment(appointment_id)
        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment not found",
            )

        therapist_uid = decoded.get("uid")
        aliases = db._therapist_uid_aliases(therapist_uid)
        if appointment.get("therapistUid") not in aliases:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this appointment",
            )

        # Build update dict with only provided fields
        updates = {
            k: v for k, v in request.model_dump(mode="json").items() if v is not None
        }

        status_value = updates.get("status")
        if status_value == AppointmentStatus.COMPLETED.value:
            updates["completedAt"] = datetime.utcnow()
        elif status_value == AppointmentStatus.CONFIRMED.value:
            updates["confirmedAt"] = datetime.utcnow()

        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No updates provided",
            )

        db.update_appointment(appointment_id, updates)

        return {
            "status": "success",
            "message": "Appointment updated successfully",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update appointment: {str(err)}",
        )


@router.post("/{appointment_id}/confirm")
async def confirm_appointment(
    appointment_id: str, authorization: str = Header(...)
):
    """Confirm an appointment and auto-add mobile patients to the therapist roster."""
    decoded = verify_token(authorization)

    try:
        appointment = db.get_appointment(appointment_id)
        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment not found",
            )

        therapist_uid = decoded.get("uid")
        aliases = db._therapist_uid_aliases(therapist_uid)
        if appointment.get("therapistUid") not in aliases:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this appointment",
            )

        updates = {
            "status": AppointmentStatus.CONFIRMED.value,
            "confirmedAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }
        db.update_appointment(appointment_id, updates)

        portal_patient_id: Optional[str] = None
        if appointment.get("source") == "mobile":
            portal_patient_id = db.ensure_patient_from_mobile_appointment(
                therapist_uid, appointment
            )
            db.update_appointment(
                appointment_id,
                {"portalPatientId": portal_patient_id},
            )

        return {
            "status": "success",
            "message": "Appointment confirmed successfully",
            "portalPatientId": portal_patient_id,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to confirm appointment: {str(err)}",
        )


@router.post("/{appointment_id}/cancel")
async def cancel_appointment(
    appointment_id: str, authorization: str = Header(...)
):
    """Cancel an appointment"""
    return await update_appointment(
        appointment_id,
        AppointmentUpdate(status=AppointmentStatus.CANCELLED),
        authorization,
    )
