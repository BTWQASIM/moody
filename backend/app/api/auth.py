"""
Authentication API endpoints for setting custom claims and managing therapist verification
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from firebase_admin import auth as firebase_auth, firestore
from app.firebase import get_auth_client, get_db_client

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SetClaimsRequest(BaseModel):
    uid: str
    role: str = "therapist"
    verified: bool = False


@router.post("/set-claims")
async def set_custom_claims(request: SetClaimsRequest):
    """
    Set custom claims on a Firebase Auth user (e.g., role, verification status).
    Called from frontend after registration to assign therapist role and verification status.
    """
    try:
        auth_client = get_auth_client()
        if not auth_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Firebase admin credentials not configured",
            )

        # Set custom claims on the user
        auth_client.set_custom_user_claims(
            request.uid,
            {
                "role": request.role,
                "verified": request.verified,
            },
        )

        return {
            "status": "success",
            "message": f"Custom claims set for user {request.uid}",
        }

    except firebase_auth.UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {request.uid} not found",
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set custom claims: {str(err)}",
        )


@router.post("/verify-therapist/{uid}")
async def verify_therapist(uid: str):
    """
    Admin endpoint to mark a therapist as verified after manual credential review.
    This endpoint should be protected by admin-only middleware.
    """
    try:
        auth_client = get_auth_client()
        db_client = get_db_client()
        
        if not auth_client or not db_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Firebase credentials not configured",
            )

        # Update custom claims
        auth_client.set_custom_user_claims(uid, {"verified": True})

        # Update Firestore document
        db_client.collection("therapists").document(uid).update({
            "status": "verified",
            "verifiedAt": firestore.SERVER_TIMESTAMP,
        })

        return {
            "status": "success",
            "message": f"Therapist {uid} verified",
        }

    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify therapist: {str(err)}",
        )
