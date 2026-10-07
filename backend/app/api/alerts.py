"""
Risk alerts API endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime

from app.models import RiskAlert, RiskLevel
from app.db import FirestoreDAO
from app.api.security import require_verified_therapist

router = APIRouter(prefix="/api/alerts", tags=["alerts"])
db = FirestoreDAO()


class RiskAlertRequest(BaseModel):
    patientId: str
    title: str
    description: str
    riskLevel: RiskLevel


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


@router.get("/")
async def get_risk_alerts(authorization: str = Header(...)):
    """Get all unacknowledged risk alerts for the therapist"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        alerts = db.get_risk_alerts_for_therapist(therapist_uid)
        return {
            "status": "success",
            "count": len(alerts),
            "alerts": alerts,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch alerts: {str(err)}",
        )


@router.post("/")
async def create_risk_alert(
    request: RiskAlertRequest, authorization: str = Header(...)
):
    """Create a risk alert"""
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

        alert = RiskAlert(
            id="",
            patientId=request.patientId,
            therapistUid=therapist_uid,
            title=request.title,
            description=request.description,
            riskLevel=request.riskLevel,
            source="manual",
            isAcknowledged=False,
            createdAt=datetime.utcnow(),
        )

        alert_id = db.create_risk_alert(alert)

        # Create notification
        from app.models import Notification
        notification = Notification(
            id="",
            userId=therapist_uid,
            type="risk_alert",
            title=request.title,
            message=request.description,
            relatedId=request.patientId,
            isRead=False,
            createdAt=datetime.utcnow(),
        )
        db.create_notification(notification)

        return {
            "status": "success",
            "message": "Risk alert created",
            "alertId": alert_id,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create alert: {str(err)}",
        )


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str, authorization: str = Header(...)
):
    """Mark a risk alert as acknowledged"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        success = db.acknowledge_risk_alert(alert_id, therapist_uid)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alert not found",
            )

        return {
            "status": "success",
            "message": "Alert acknowledged",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to acknowledge alert: {str(err)}",
        )
