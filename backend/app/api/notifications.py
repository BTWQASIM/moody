"""
Notifications API endpoints
"""

from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime
from app.firebase import get_db_client

from app.models import Notification
from app.db import FirestoreDAO
from app.api.security import require_portal_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
db = FirestoreDAO()


class NotificationUpdate(BaseModel):
    isRead: bool = True


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
        require_portal_user(decoded)
        return decoded
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(err)}",
        )


@router.get("/")
async def get_notifications(authorization: str = Header(...)):
    """Get notifications for the user"""
    decoded = verify_token(authorization)
    user_id = decoded.get("uid")
    db_client = get_db_client()

    try:
        is_admin = False
        if decoded.get("role") == "admin":
            is_admin = True
        elif db_client:
            admin_doc = db_client.collection("admins").document(user_id).get()
            is_admin = bool(admin_doc.exists)

        if is_admin and db_client:
            therapists = []
            for doc in db_client.collection("therapists").stream():
                payload = doc.to_dict() or {}
                profile_role = str(payload.get("role") or "therapist").lower()
                profile_status = str(payload.get("status") or "").lower()

                # Never show admin/self records in therapist verification queue.
                if doc.id == user_id or profile_role == "admin":
                    continue

                if payload.get("verified", False):
                    continue

                # Only pending applications should generate verification-request notifications.
                if profile_status and profile_status not in {"pending_verification", "pending", "submitted"}:
                    continue

                therapist_name = payload.get("name") or payload.get("email") or doc.id
                created_at = payload.get("createdAt")
                if isinstance(created_at, datetime):
                    created_label = created_at.strftime("%Y-%m-%d %H:%M")
                elif created_at:
                    created_label = str(created_at)
                else:
                    created_label = "recently"

                therapists.append(
                    {
                        "id": f"therapist-verification-{doc.id}",
                        "userId": user_id,
                        "type": "therapist_verification_request",
                        "title": "New therapist verification request",
                        "message": f"{therapist_name} is waiting for verification.",
                        "relatedId": doc.id,
                        "isRead": False,
                        "readAt": None,
                        "createdAt": payload.get("createdAt") or created_label,
                    }
                )

            therapists.sort(key=lambda item: str(item.get("createdAt", "")), reverse=True)
            notifications = therapists[:50]
            unread_count = len(notifications)

            return {
                "status": "success",
                "count": len(notifications),
                "unreadCount": unread_count,
                "notifications": notifications,
            }

        notifications = db.get_notifications_for_user(user_id)
        unread_count = sum(1 for n in notifications if not n.get("isRead", False))
        
        return {
            "status": "success",
            "count": len(notifications),
            "unreadCount": unread_count,
            "notifications": notifications,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch notifications: {str(err)}",
        )


@router.patch("/read-all")
async def mark_all_notifications_read(authorization: str = Header(...)):
    """Persist read state for the authenticated user's stored notifications."""
    decoded = verify_token(authorization)
    user_id = decoded.get("uid")
    db_client = get_db_client()

    if decoded.get("role") == "admin" or (
        db_client
        and db_client.collection("admins").document(user_id).get().exists
    ):
        return {
            "status": "success",
            "updated": 0,
            "message": "Admin verification requests remain active until reviewed",
        }

    try:
        updated = db.mark_notifications_read(user_id)
        return {
            "status": "success",
            "updated": updated,
            "message": "Notifications marked as read",
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update notifications: {str(err)}",
        )
