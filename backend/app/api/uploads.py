"""
File upload and management API endpoints
Handles profile photos, documents, recordings, and exports
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header, UploadFile, File, Form
from firebase_admin import auth as firebase_auth, storage
from datetime import datetime, timedelta
import os

from app.db import FirestoreDAO

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
db = FirestoreDAO()


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


def get_bucket():
    """Get Firebase Storage bucket"""
    try:
        return storage.bucket()
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage not configured: {str(err)}",
        )


def generate_signed_url(bucket_name: str, blob_name: str) -> str:
    """Generate a signed URL for a file (valid for 1 hour)"""
    try:
        bucket = get_bucket()
        blob = bucket.blob(blob_name)
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(hours=1),
            method="GET"
        )
        return url
    except Exception:
        # Fallback: return public URL if signing fails
        return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"


@router.post("/profile-photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    authorization: str = Header(...),
):
    """Upload a profile photo for therapist or patient"""
    decoded = verify_token(authorization)
    user_id = decoded.get("uid")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    if file.size and file.size > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large (max 5MB)",
        )

    try:
        bucket = get_bucket()
        
        # Determine file extension
        ext = file.filename.split(".")[-1] if file.filename else "jpg"
        file_path = f"profile-photos/{user_id}/{datetime.utcnow().timestamp()}.{ext}"
        
        # Upload file
        blob = bucket.blob(file_path)
        contents = await file.read()
        blob.upload_from_string(
            contents,
            content_type=file.content_type,
        )

        # Generate signed URL
        signed_url = generate_signed_url(bucket.name, file_path)

        return {
            "status": "success",
            "message": "Profile photo uploaded",
            "fileUrl": signed_url,
            "filePath": file_path,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(err)}",
        )


@router.post("/document")
async def upload_document(
    file: UploadFile = File(...),
    documentType: str = Form(...),  # "license", "certification", "insurance", etc.
    authorization: str = Header(...),
):
    """Upload a document (license, certification, insurance card, etc.)"""
    decoded = verify_token(authorization)
    user_id = decoded.get("uid")

    # Allowed document types
    allowed_types = [
        "license",
        "certification",
        "insurance",
        "consent_form",
        "other",
    ]
    if documentType not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document type. Allowed: {', '.join(allowed_types)}",
        )

    if file.size and file.size > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large (max 10MB)",
        )

    try:
        bucket = get_bucket()

        # Extract file extension
        ext = file.filename.split(".")[-1] if file.filename else "pdf"
        file_path = (
            f"documents/{user_id}/{documentType}/{datetime.utcnow().timestamp()}.{ext}"
        )

        # Upload file
        blob = bucket.blob(file_path)
        contents = await file.read()
        blob.upload_from_string(
            contents,
            content_type=file.content_type or "application/octet-stream",
        )

        # Generate signed URL
        signed_url = generate_signed_url(bucket.name, file_path)

        return {
            "status": "success",
            "message": "Document uploaded",
            "fileUrl": signed_url,
            "filePath": file_path,
            "documentType": documentType,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(err)}",
        )


@router.post("/audio-recording")
async def upload_audio_recording(
    file: UploadFile = File(...),
    patientId: str = Form(...),
    sessionDate: str = Form(...),
    authorization: str = Header(...),
):
    """Upload audio recording of a session"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    # Verify patient belongs to therapist
    patient = db.get_patient(patientId)
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

    if not file.content_type or "audio" not in file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an audio file",
        )

    if file.size and file.size > 100 * 1024 * 1024:  # 100MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large (max 100MB)",
        )

    try:
        bucket = get_bucket()

        # Extract file extension
        ext = file.filename.split(".")[-1] if file.filename else "m4a"
        file_path = f"recordings/{therapist_uid}/{patientId}/{sessionDate}/{datetime.utcnow().timestamp()}.{ext}"

        # Upload file
        blob = bucket.blob(file_path)
        contents = await file.read()
        blob.upload_from_string(
            contents,
            content_type=file.content_type,
        )

        # Generate signed URL
        signed_url = generate_signed_url(bucket.name, file_path)

        return {
            "status": "success",
            "message": "Recording uploaded",
            "fileUrl": signed_url,
            "filePath": file_path,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(err)}",
        )


@router.post("/session-export")
async def upload_session_export(
    file: UploadFile = File(...),
    appointmentId: str = Form(...),
    authorization: str = Header(...),
):
    """Upload an exported session (PDF, transcript, etc.)"""
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    # Verify appointment belongs to therapist
    appointment = db.get_appointment(appointmentId)
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found",
        )

    if appointment.get("therapistUid") != therapist_uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Appointment does not belong to you",
        )

    if file.size and file.size > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large (max 50MB)",
        )

    try:
        bucket = get_bucket()

        # Extract file extension
        ext = file.filename.split(".")[-1] if file.filename else "pdf"
        file_path = f"exports/{therapist_uid}/{appointmentId}/{datetime.utcnow().timestamp()}.{ext}"

        # Upload file
        blob = bucket.blob(file_path)
        contents = await file.read()
        blob.upload_from_string(
            contents,
            content_type=file.content_type or "application/octet-stream",
        )

        # Generate signed URL
        signed_url = generate_signed_url(bucket.name, file_path)

        # Update appointment with export URL
        db.update_appointment(appointmentId, {"sessionNotes": signed_url})

        return {
            "status": "success",
            "message": "Session exported and uploaded",
            "fileUrl": signed_url,
            "filePath": file_path,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(err)}",
        )


@router.delete("/{file_path:path}")
async def delete_file(file_path: str, authorization: str = Header(...)):
    """Delete an uploaded file"""
    decoded = verify_token(authorization)
    user_id = decoded.get("uid")

    # Verify user owns the file (basic check: file path contains user_id)
    if user_id not in file_path:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this file",
        )

    try:
        bucket = get_bucket()
        blob = bucket.blob(file_path)

        if not blob.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found",
            )

        blob.delete()

        return {
            "status": "success",
            "message": "File deleted",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Delete failed: {str(err)}",
        )
