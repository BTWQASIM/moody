"""
Messaging API endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header, Query
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime

from app.models import Message, MessageThread
from app.db import FirestoreDAO

router = APIRouter(prefix="/api/messages", tags=["messages"])
db = FirestoreDAO()


class MessageRequest(BaseModel):
    threadId: str
    recipientId: str
    content: str
    attachments: list = []


class MessageThreadRequest(BaseModel):
    patientId: str
    subject: str


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


@router.get("/threads")
async def get_message_threads(authorization: str = Header(...)):
    """Get all message threads for the therapist"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        threads = db.get_message_threads_for_therapist(therapist_uid)
        return {
            "status": "success",
            "count": len(threads),
            "threads": threads,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch threads: {str(err)}",
        )


@router.post("/threads")
async def create_message_thread(
    request: MessageThreadRequest, authorization: str = Header(...)
):
    """Create a new message thread"""
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

        thread = MessageThread(
            id="",
            therapistUid=therapist_uid,
            patientId=request.patientId,
            subject=request.subject,
            lastMessage="",
            lastMessageAt=datetime.utcnow(),
            isActive=True,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        thread_id = db.create_message_thread(thread)
        return {
            "status": "success",
            "message": "Thread created",
            "threadId": thread_id,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create thread: {str(err)}",
        )


@router.get("/threads/{thread_id}")
async def get_thread_messages(
    thread_id: str, authorization: str = Header(...)
):
    """Get all messages in a thread"""
    decoded = verify_token(authorization)

    try:
        messages = db.get_messages_for_thread(thread_id)
        return {
            "status": "success",
            "count": len(messages),
            "messages": messages,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch messages: {str(err)}",
        )


@router.post("/")
async def send_message(
    request: MessageRequest, authorization: str = Header(...)
):
    """Send a message in a thread"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        message = Message(
            id="",
            threadId=request.threadId,
            senderId=therapist_uid,
            senderType="therapist",
            recipientId=request.recipientId,
            content=request.content,
            attachments=request.attachments,
            isRead=False,
            createdAt=datetime.utcnow(),
        )

        message_id = db.create_message(message)

        # Create notification for patient
        from app.models import Notification
        notification = Notification(
            id="",
            userId=request.recipientId,
            type="message",
            title="New message from your therapist",
            message=request.content[:100],
            relatedId=request.threadId,
            isRead=False,
            createdAt=datetime.utcnow(),
        )
        db.create_notification(notification)

        return {
            "status": "success",
            "message": "Message sent",
            "messageId": message_id,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send message: {str(err)}",
        )
