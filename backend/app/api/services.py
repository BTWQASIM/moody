"""
Services management API endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel

from app.models import ServiceOffering
from app.db import FirestoreDAO

router = APIRouter(prefix="/api/services", tags=["services"])
db = FirestoreDAO()


class ServiceRequest(BaseModel):
    name: str
    description: str
    duration: int  # minutes
    price: float


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
    request: ServiceRequest,
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

        updates = request.model_dump()
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
