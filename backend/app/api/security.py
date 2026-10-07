"""Authorization checks shared by protected portal APIs."""

from typing import Any, Dict

from fastapi import HTTPException, status

from app.firebase import get_db_client


def require_verified_therapist(decoded: Dict[str, Any]) -> None:
    """Require a currently approved therapist, using Firestore as authority."""
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticated user",
        )

    if decoded.get("role") == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Therapist access required",
        )

    verified = bool(decoded.get("verified", False))
    db_client = get_db_client()
    if db_client:
        snapshot = db_client.collection("therapists").document(uid).get()
        if snapshot.exists:
            profile = snapshot.to_dict() or {}
            verified = bool(profile.get("verified", False))
            account_status = str(profile.get("status") or "").lower()
            if account_status in {"suspended", "revoked", "rejected", "inactive"}:
                verified = False

    if not verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verified therapist access required",
        )


def require_portal_user(decoded: Dict[str, Any]) -> None:
    """Allow administrators or currently approved therapists."""
    if decoded.get("role") == "admin":
        return

    db_client = get_db_client()
    uid = decoded.get("uid")
    if db_client and uid:
        admin_doc = db_client.collection("admins").document(uid).get()
        if admin_doc.exists:
            return

    require_verified_therapist(decoded)
