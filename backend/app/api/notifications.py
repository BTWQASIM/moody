"""
Notifications API endpoints
"""

from fastapi import APIRouter, HTTPException, status, Header
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime

from app.models import Notification
from app.db import FirestoreDAO

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
        return decoded
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

    try:
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
