"""
Services management API endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel, Field

from app.models import ServiceOffering
from app.db import FirestoreDAO
from app.api.security import require_verified_therapist

router = APIRouter(prefix="/api/services", tags=["services"])
db = FirestoreDAO()


class ServiceRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str
    duration: int = Field(gt=0)  # minutes
    price: float = Field(ge=0)
    specialization: Optional[str] = None
    deliveryMode: Optional[str] = None


class ServiceUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = Field(default=None, gt=0)
    price: Optional[float] = Field(default=None, ge=0)
    specialization: Optional[str] = None
    deliveryMode: Optional[str] = None
    isActive: Optional[bool] = None


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
async def list_services(authorization: str = Header(...)):
    """List all services for the therapist"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        services = db.get_services_for_therapist(therapist_uid)
        return {
            "status": "success",
            "count": len(services),
            "services": services,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch services: {str(err)}",
        )


@router.post("/")
async def create_service(
    request: ServiceRequest, authorization: str = Header(...)
):
    """Create a new service offering"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        from datetime import datetime
        
        service = ServiceOffering(
            id="",
            therapistUid=therapist_uid,
            name=request.name,
            description=request.description,
            duration=request.duration,
            price=request.price,
            specialization=request.specialization,
            deliveryMode=request.deliveryMode,
            isActive=True,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        service_id = db.create_service(service)
        return {
            "status": "success",
            "message": "Service created successfully",
            "serviceId": service_id,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create service: {str(err)}",
        )


@router.patch("/{service_id}")
async def update_service(
    service_id: str,
    request: ServiceUpdateRequest,
    authorization: str = Header(...),
):
    """Update a service"""
    decoded = verify_token(authorization)

    try:
        # Get service to verify ownership
        services = db.get_services_for_therapist(decoded.get("uid"))
        service = next((s for s in services if s.get("id") == service_id), None)
        
        if not service:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Service not found",
            )

        updates = {
            key: value
            for key, value in request.model_dump().items()
            if value is not None
        }
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No updates provided",
            )

        db.update_service(service_id, updates)

        return {
            "status": "success",
            "message": "Service updated successfully",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update service: {str(err)}",
        )


@router.delete("/{service_id}")
async def delete_service(service_id: str, authorization: str = Header(...)):
    """Delete a service (deactivate)"""
    decoded = verify_token(authorization)

    try:
        # Get service to verify ownership
        services = db.get_services_for_therapist(decoded.get("uid"))
        service = next((s for s in services if s.get("id") == service_id), None)
        
        if not service:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Service not found",
            )

        db.update_service(service_id, {"isActive": False})

        return {
            "status": "success",
            "message": "Service deactivated",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete service: {str(err)}",
        )
