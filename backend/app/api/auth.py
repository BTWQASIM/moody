"""
Authentication API endpoints for setting custom claims and managing therapist verification
"""

from datetime import datetime
import hmac
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from firebase_admin import auth as firebase_auth, firestore
from app.firebase import get_auth_client, get_db_client
from app.password_policy import password_validation_error
from app.api.security import require_portal_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


def _day_name_to_day_of_week(day: str) -> int:
    try:
        index = WEEKDAYS.index(day)
    except ValueError:
        return 0
    return 0 if index == 6 else index + 1


def _normalize_availability(
    raw: Optional[List[Dict[str, Any]]],
) -> Optional[List[Dict[str, Any]]]:
    """Store availability in mobile-compatible format for patient booking."""
    if not raw:
        return None

    normalized: List[Dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue

        if "dayOfWeek" in entry:
            start = entry.get("startTime") or entry.get("start") or "09:00"
            end = entry.get("endTime") or entry.get("end") or "17:00"
            normalized.append(
                {
                    "dayOfWeek": int(entry.get("dayOfWeek", 0)),
                    "startTime": start,
                    "endTime": end,
                }
            )
            continue

        if "day" in entry and not entry.get("enabled", True):
            continue

        if "day" in entry:
            start = entry.get("start") or entry.get("startTime") or "09:00"
            end = entry.get("end") or entry.get("endTime") or "17:00"
            normalized.append(
                {
                    "dayOfWeek": _day_name_to_day_of_week(str(entry.get("day", ""))),
                    "startTime": start,
                    "endTime": end,
                }
            )

    return normalized or None


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
    availability: Optional[List[Dict[str, Any]]] = None


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
    availability: Optional[List[Dict[str, Any]]] = None
    notificationPreferences: Optional[Dict[str, bool]] = None


class UpdateTherapistAccessRequest(BaseModel):
    verified: bool
    status: Optional[str] = None


class UpdateTherapistCredentialsRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualifications: Optional[str] = None
    licenseNumber: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    bio: Optional[str] = None
    specializations: Optional[List[str]] = None
    profilePhoto: Optional[str] = None
    availability: Optional[List[Dict[str, Any]]] = None
    password: Optional[str] = None


class BootstrapAdminRequest(BaseModel):
    email: Optional[str] = None
    uid: Optional[str] = None


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


def _is_admin(decoded: Dict[str, Any], db_client: Any) -> bool:
    if decoded.get("role") == "admin":
        return True

    uid = decoded.get("uid")
    if not uid or not db_client:
        return False

    admin_doc = db_client.collection("admins").document(uid).get()
    if admin_doc.exists:
        return True

    therapist_doc = db_client.collection("therapists").document(uid).get()
    if therapist_doc.exists:
        profile = therapist_doc.to_dict() or {}
        return profile.get("role") == "admin"

    return False


def _require_admin(decoded: Dict[str, Any], db_client: Any) -> None:
    if not _is_admin(decoded, db_client):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


def _set_claims_preserving_existing(
    auth_client: Any,
    uid: str,
    updates: Dict[str, Any],
) -> Dict[str, Any]:
    user_record = auth_client.get_user(uid)
    existing_claims = user_record.custom_claims or {}
    merged_claims = {**existing_claims, **updates}
    auth_client.set_custom_user_claims(uid, merged_claims)
    return merged_claims


def _bootstrap_enabled() -> bool:
    return os.getenv("ADMIN_BOOTSTRAP_ENABLED", "false").strip().lower() == "true"


def _bootstrap_secret() -> str:
    return os.getenv("ADMIN_BOOTSTRAP_SECRET", "").strip()


def _bootstrap_used(db_client: Any) -> bool:
    doc = db_client.collection("system").document("bootstrap").get()
    if not doc.exists:
        return False
    payload = doc.to_dict() or {}
    return bool(payload.get("adminBootstrapUsed", False))


def _has_any_admin(db_client: Any) -> bool:
    admin_docs = db_client.collection("admins").limit(1).stream()
    return any(True for _ in admin_docs)


@router.post("/set-claims")
async def set_custom_claims(request: SetClaimsRequest, authorization: str = Header(...)):
    """
    Set custom claims on a Firebase Auth user (e.g., role, verification status).
    Called from frontend after registration to assign therapist role and verification status.
    """
    try:
        decoded = verify_token(authorization)
        auth_client = get_auth_client()
        db_client = get_db_client()
        if not auth_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Firebase admin credentials not configured",
            )

        is_admin = _is_admin(decoded, db_client)
        if decoded.get("uid") != request.uid and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own account claims",
            )

        if request.role == "admin" and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can assign admin role",
            )

        if not is_admin:
            request.role = "therapist"
            request.verified = False
            request.status = "pending_verification"

        merged_claims = _set_claims_preserving_existing(
            auth_client,
            request.uid,
            {
                "role": request.role,
                "verified": request.verified,
            },
        )

        # Optionally upsert therapist profile in Firestore as part of registration flow.
        profile_updates: Dict[str, Any] = {
            "uid": request.uid,
            "role": request.role,
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
            "availability": _normalize_availability(request.availability),
            "status": request.status or ("verified" if request.verified else "pending_verification"),
            "verified": request.verified,
            "updatedAt": datetime.utcnow().isoformat(),
        }

        if db_client and any(
            value is not None
            for key, value in profile_updates.items()
            if key not in {"uid", "updatedAt", "status", "verified"}
        ):
            target_collection = "admins" if request.role == "admin" else "therapists"
            existing = db_client.collection(target_collection).document(request.uid).get()
            if not existing.exists:
                profile_updates["createdAt"] = datetime.utcnow().isoformat()

            db_client.collection(target_collection).document(request.uid).set(
                {k: v for k, v in profile_updates.items() if v is not None},
                merge=True,
            )

        if db_client and request.role == "therapist":
            db_client.collection("therapists").document(request.uid).set(
                {
                    "uid": request.uid,
                    "role": "therapist",
                    "verified": request.verified,
                    "status": request.status or ("verified" if request.verified else "pending_verification"),
                    "updatedAt": datetime.utcnow().isoformat(),
                },
                merge=True,
            )

        return {
            "status": "success",
            "message": f"Custom claims set for user {request.uid}",
            "claims": merged_claims,
        }

    except HTTPException:
        raise
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


@router.post("/bootstrap-admin")
async def bootstrap_admin(
    request: BootstrapAdminRequest,
    x_bootstrap_secret: str = Header(default="", alias="X-Bootstrap-Secret"),
):
    """One-time endpoint to create the very first admin by UID or email."""
    auth_client = get_auth_client()
    db_client = get_db_client()

    if not auth_client or not db_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    if not _bootstrap_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin bootstrap is disabled",
        )

    configured_secret = _bootstrap_secret()
    if not configured_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ADMIN_BOOTSTRAP_SECRET is not configured",
        )

    if not hmac.compare_digest(x_bootstrap_secret, configured_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bootstrap secret",
        )

    if _bootstrap_used(db_client) or _has_any_admin(db_client):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bootstrap already completed",
        )

    if not request.uid and not request.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either uid or email",
        )

    try:
        user_record = (
            auth_client.get_user(request.uid)
            if request.uid
            else auth_client.get_user_by_email(request.email)
        )

        claims = _set_claims_preserving_existing(
            auth_client,
            user_record.uid,
            {
                "role": "admin",
                "verified": True,
            },
        )

        now = datetime.utcnow().isoformat()
        db_client.collection("admins").document(user_record.uid).set(
            {
                "uid": user_record.uid,
                "email": user_record.email,
                "name": user_record.display_name,
                "role": "admin",
                "active": True,
                "createdAt": now,
                "updatedAt": now,
            },
            merge=True,
        )

        db_client.collection("system").document("bootstrap").set(
            {
                "adminBootstrapUsed": True,
                "bootstrappedAdminUid": user_record.uid,
                "bootstrappedAt": now,
            },
            merge=True,
        )

        return {
            "status": "success",
            "message": "Initial admin bootstrapped successfully",
            "uid": user_record.uid,
            "email": user_record.email,
            "claims": claims,
        }
    except HTTPException:
        raise
    except firebase_auth.UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bootstrap target user not found",
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bootstrap admin: {str(err)}",
        )


@router.post("/verify-therapist/{uid}")
async def verify_therapist(uid: str, authorization: str = Header(...)):
    """
    Admin endpoint to mark a therapist as verified after manual credential review.
    This endpoint should be protected by admin-only middleware.
    """
    try:
        decoded = verify_token(authorization)
        auth_client = get_auth_client()
        db_client = get_db_client()
        
        if not auth_client or not db_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Firebase credentials not configured",
            )

        _require_admin(decoded, db_client)

        # Update custom claims while preserving role and other fields
        _set_claims_preserving_existing(auth_client, uid, {"verified": True})

        # Update Firestore document
        db_client.collection("therapists").document(uid).update({
            "status": "verified",
            "verified": True,
            "verifiedAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": datetime.utcnow().isoformat(),
        })

        return {
            "status": "success",
            "message": f"Therapist {uid} verified",
        }

    except HTTPException:
        raise
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

        role = decoded.get("role")
        verified = bool(decoded.get("verified", False))

        if role == "admin":
            admin_doc = db_client.collection("admins").document(uid).get()
            if admin_doc.exists:
                profile = admin_doc.to_dict() or {}
            verified = True

        return {
            "status": "success",
            "profile": profile,
            "role": role,
            "verified": verified,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch profile: {str(err)}",
        )


@router.get("/access-status")
async def get_access_status(authorization: str = Header(...)):
    """Resolve role/verification from Firestore and claims for login access control."""
    decoded = verify_token(authorization)
    uid = decoded.get("uid")
    db_client = get_db_client()

    if not db_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    role = decoded.get("role") or "therapist"
    verified = bool(decoded.get("verified", False))
    access_status = "verified" if verified else "pending_verification"

    if _is_admin(decoded, db_client):
        role = "admin"
        verified = True
        access_status = "active"
    else:
        therapist_doc = db_client.collection("therapists").document(uid).get()
        if therapist_doc.exists:
            profile = therapist_doc.to_dict() or {}
            role = profile.get("role", role)
            verified = bool(profile.get("verified", verified))
            access_status = str(
                profile.get("status", "verified" if verified else "pending_verification")
            )

    return {
        "status": "success",
        "access": {
            "uid": uid,
            "role": role,
            "verified": verified,
            "status": access_status,
        },
    }


@router.get("/therapists")
async def list_therapists_for_admin(authorization: str = Header(...)):
    decoded = verify_token(authorization)
    db_client = get_db_client()

    if not db_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    _require_admin(decoded, db_client)

    try:
        uploaded_documents_by_owner: Dict[str, List[str]] = {}
        for upload_doc in db_client.collection("uploadedFiles").stream():
            upload = upload_doc.to_dict() or {}
            owner_uid = str(upload.get("ownerUid") or "")
            file_url = str(upload.get("fileUrl") or "")
            if upload.get("category") == "document" and owner_uid and file_url:
                uploaded_documents_by_owner.setdefault(owner_uid, []).append(file_url)

        docs = db_client.collection("therapists").stream()
        therapists = []
        for doc in docs:
            profile = doc.to_dict() or {}
            role = str(profile.get("role") or "therapist").lower()

            # Admins are a separate entity and must never appear in therapist access.
            if role == "admin":
                continue

            if db_client.collection("admins").document(doc.id).get().exists:
                continue

            profile.setdefault("uid", doc.id)
            profile.setdefault("role", "therapist")
            profile.setdefault("verified", False)
            profile.setdefault("status", "pending_verification")
            submitted_urls = [
                str(url)
                for url in (profile.get("documentUrls") or [])
                if isinstance(url, str) and url
            ]
            profile["documentUrls"] = list(
                dict.fromkeys(
                    submitted_urls + uploaded_documents_by_owner.get(doc.id, [])
                )
            )
            therapists.append(profile)

        therapists.sort(key=lambda t: str(t.get("createdAt", "")), reverse=True)

        return {
            "status": "success",
            "count": len(therapists),
            "therapists": therapists,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch therapists: {str(err)}",
        )


@router.patch("/therapists/{uid}/access")
async def update_therapist_access(
    uid: str,
    request: UpdateTherapistAccessRequest,
    authorization: str = Header(...),
):
    decoded = verify_token(authorization)
    auth_client = get_auth_client()
    db_client = get_db_client()

    if not auth_client or not db_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    _require_admin(decoded, db_client)

    try:
        therapist_doc = db_client.collection("therapists").document(uid).get()
        if therapist_doc.exists:
            therapist_profile = therapist_doc.to_dict() or {}
            if str(therapist_profile.get("role") or "therapist").lower() == "admin":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target UID is an admin, not a therapist",
                )

        if db_client.collection("admins").document(uid).get().exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target UID is an admin, not a therapist",
            )

        _set_claims_preserving_existing(auth_client, uid, {"verified": request.verified})

        profile_updates: Dict[str, Any] = {
            "verified": request.verified,
            "status": request.status
            or ("verified" if request.verified else "suspended"),
            "updatedAt": datetime.utcnow().isoformat(),
        }
        if request.verified:
            profile_updates["verifiedAt"] = firestore.SERVER_TIMESTAMP
            profile_updates["revokedAt"] = None
        else:
            profile_updates["revokedAt"] = firestore.SERVER_TIMESTAMP

        db_client.collection("therapists").document(uid).set(profile_updates, merge=True)

        return {
            "status": "success",
            "message": f"Therapist access updated for {uid}",
        }
    except HTTPException:
        raise
    except firebase_auth.UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {uid} not found",
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update therapist access: {str(err)}",
        )


@router.patch("/therapists/{uid}/credentials")
async def update_therapist_credentials(
    uid: str,
    request: UpdateTherapistCredentialsRequest,
    authorization: str = Header(...),
):
    decoded = verify_token(authorization)
    auth_client = get_auth_client()
    db_client = get_db_client()

    if not auth_client or not db_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    _require_admin(decoded, db_client)

    try:
        therapist_doc = db_client.collection("therapists").document(uid).get()
        if therapist_doc.exists:
            therapist_profile = therapist_doc.to_dict() or {}
            if str(therapist_profile.get("role") or "therapist").lower() == "admin":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target UID is an admin, not a therapist",
                )

        if db_client.collection("admins").document(uid).get().exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target UID is an admin, not a therapist",
            )

        auth_updates: Dict[str, Any] = {}
        if request.email:
            auth_updates["email"] = request.email
        if request.password:
            password_error = password_validation_error(request.password)
            if password_error:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=password_error,
                )
            auth_updates["password"] = request.password
        if request.name:
            auth_updates["display_name"] = request.name

        if auth_updates:
            auth_client.update_user(uid, **auth_updates)

        profile_updates = {
            key: value
            for key, value in request.model_dump().items()
            if value is not None and key != "password"
        }
        if profile_updates:
            profile_updates["updatedAt"] = datetime.utcnow().isoformat()
            db_client.collection("therapists").document(uid).set(
                profile_updates,
                merge=True,
            )

        return {
            "status": "success",
            "message": f"Therapist credentials updated for {uid}",
        }
    except HTTPException:
        raise
    except firebase_auth.UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {uid} not found",
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update therapist credentials: {str(err)}",
        )


@router.patch("/profile")
async def update_my_profile(
    request: UpdateProfileRequest,
    authorization: str = Header(...),
):
    """Update logged-in therapist profile using backend-admin Firestore access."""
    decoded = verify_token(authorization)
    require_portal_user(decoded)
    uid = decoded.get("uid")
    auth_client = get_auth_client()
    db_client = get_db_client()

    if not db_client or not auth_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase credentials not configured",
        )

    updates = {
        key: value
        for key, value in request.model_dump().items()
        if value is not None
    }
    if "email" in updates:
        updates["email"] = updates["email"].strip().lower()
    if "availability" in updates:
        updates["availability"] = _normalize_availability(updates["availability"])
    updates["updatedAt"] = datetime.utcnow().isoformat()
    is_admin = _is_admin(decoded, db_client)
    target_collection = "admins" if is_admin else "therapists"

    previous_auth_user = None
    should_update_auth = bool(request.name or request.email)
    auth_was_updated = False

    try:
        if should_update_auth:
            previous_auth_user = auth_client.get_user(uid)
            auth_updates = {}
            if request.name:
                auth_updates["display_name"] = request.name
            if request.email:
                auth_updates["email"] = updates["email"]
            auth_client.update_user(uid, **auth_updates)
            auth_was_updated = True

        ref = db_client.collection(target_collection).document(uid)
        existing = ref.get()
        if not existing.exists:
            updates["uid"] = uid
            updates["createdAt"] = datetime.utcnow().isoformat()

            if is_admin:
                updates["role"] = "admin"
                updates["active"] = True

        ref.set(updates, merge=True)
        return {
            "status": "success",
            "message": "Profile updated successfully",
        }
    except Exception as err:
        # Avoid leaving Firebase Auth and the portal profile out of sync if the
        # Firestore write fails after the identity record was updated.
        if auth_was_updated and previous_auth_user is not None:
            try:
                rollback = {}
                if request.name:
                    rollback["display_name"] = previous_auth_user.display_name
                if request.email:
                    rollback["email"] = previous_auth_user.email
                auth_client.update_user(uid, **rollback)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update profile: {str(err)}",
        )
