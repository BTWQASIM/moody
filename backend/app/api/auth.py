"""
Authentication API endpoints for setting custom claims and managing therapist verification
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from firebase_admin import auth as firebase_auth, firestore
from app.firebase import get_auth_client, get_db_client

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SetClaimsRequest(BaseModel):
    uid: str
    role: str = "therapist"
    verified: bool = False
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualifications: Optional[str] = None
    licenseNumber: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    bio: Optional[str] = None
    specializations: Optional[List[str]] = None
    profilePhoto: Optional[str] = None
    documentUrls: Optional[List[str]] = None
    status: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualifications: Optional[str] = None
    licenseNumber: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    bio: Optional[str] = None
    specializations: Optional[List[str]] = None
    profilePhoto: Optional[str] = None


def verify_token(authorization: str = Header(...)):
    """Verify Firebase ID token from Authorization header."""
    try:
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header",
            )
        token = authorization.split(" ")[1]
        return firebase_auth.verify_id_token(token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(err)}",
        )


@router.post("/set-claims")
async def set_custom_claims(request: SetClaimsRequest):
    """
    Set custom claims on a Firebase Auth user (e.g., role, verification status).
    Called from frontend after registration to assign therapist role and verification status.
    """
    try:
        auth_client = get_auth_client()
        db_client = get_db_client()
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

        # Optionally upsert therapist profile in Firestore as part of registration flow.
        profile_updates = {
            "uid": request.uid,
            "name": request.name,
            "email": request.email,
            "phone": request.phone,
            "qualifications": request.qualifications,
            "licenseNumber": request.licenseNumber,
            "yearsOfExperience": request.yearsOfExperience,
            "bio": request.bio,
            "specializations": request.specializations,
            "profilePhoto": request.profilePhoto,
            "documentUrls": request.documentUrls,
            "status": request.status or ("verified" if request.verified else "pending_verification"),
            "verified": request.verified,
            "updatedAt": datetime.utcnow().isoformat(),
        }

        if db_client and any(
            value is not None
            for key, value in profile_updates.items()
            if key not in {"uid", "updatedAt", "status", "verified"}
        ):
            existing = db_client.collection("therapists").document(request.uid).get()
            if not existing.exists:
                profile_updates["createdAt"] = datetime.utcnow().isoformat()

            db_client.collection("therapists").document(request.uid).set(
                {k: v for k, v in profile_updates.items() if v is not None},
                merge=True,
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


@router.get("/profile")
async def get_my_profile(authorization: str = Header(...)):
    """Get logged-in therapist profile using backend-admin Firestore access."""
    decoded = verify_token(authorization)
    uid = decoded.get("uid")
    db_client = get_db_client()

    if not db_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    try:
        doc = db_client.collection("therapists").document(uid).get()
        profile = doc.to_dict() if doc.exists else {}
        return {
            "status": "success",
            "profile": profile,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch profile: {str(err)}",
        )


@router.patch("/profile")
async def update_my_profile(
    request: UpdateProfileRequest,
    authorization: str = Header(...),
):
    """Update logged-in therapist profile using backend-admin Firestore access."""
    decoded = verify_token(authorization)
    uid = decoded.get("uid")
    db_client = get_db_client()

    if not db_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    updates = {
        key: value
        for key, value in request.model_dump().items()
        if value is not None
    }
    updates["updatedAt"] = datetime.utcnow().isoformat()

    try:
        ref = db_client.collection("therapists").document(uid)
        existing = ref.get()
        if not existing.exists:
            updates["uid"] = uid
            updates["createdAt"] = datetime.utcnow().isoformat()

        ref.set(updates, merge=True)
        return {
            "status": "success",
            "message": "Profile updated successfully",
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update profile: {str(err)}",
        )
