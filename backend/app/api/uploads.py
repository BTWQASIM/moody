"""
File upload and management API endpoints
Handles profile photos, documents, recordings, and exports
"""

from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header, UploadFile, File, Form
from firebase_admin import auth as firebase_auth, storage
from datetime import datetime, timedelta
import os
import re
import secrets

from app.db import FirestoreDAO

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
db = FirestoreDAO()
LOCAL_UPLOADS_ROOT = Path(os.getenv("LOCAL_UPLOADS_DIR", "./uploads")).resolve()
LOCAL_UPLOADS_URL_BASE = os.getenv(
    "LOCAL_UPLOADS_URL_BASE", "http://localhost:8000/uploads"
).rstrip("/")


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


def sanitize_segment(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]", "_", value)
    return cleaned or "file"


def local_upload(file_path: str, contents: bytes) -> str:
    absolute_path = (LOCAL_UPLOADS_ROOT / file_path).resolve()

    # Prevent path traversal outside uploads root.
    if not str(absolute_path).startswith(str(LOCAL_UPLOADS_ROOT)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path",
        )

    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_bytes(contents)
    return f"{LOCAL_UPLOADS_URL_BASE}/{file_path}"


def upload_to_storage_or_local(file_path: str, contents: bytes, content_type: str) -> str:
    try:
        bucket = get_bucket()
        blob = bucket.blob(file_path)
        blob.upload_from_string(contents, content_type=content_type)
        return generate_signed_url(bucket.name, file_path)
    except Exception:
        # Firebase Storage may be unavailable in local development.
        return local_upload(file_path, contents)


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
        # Determine file extension
        contents = await file.read()
        ext = file.filename.split(".")[-1] if file.filename else "jpg"
        ext = sanitize_segment(ext.lower())
        file_path = (
            f"profile-photos/{sanitize_segment(user_id)}/"
            f"{datetime.utcnow().timestamp()}-{secrets.token_hex(4)}.{ext}"
        )
        file_url = upload_to_storage_or_local(file_path, contents, file.content_type)

        return {
            "status": "success",
            "message": "Profile photo uploaded",
            "fileUrl": file_url,
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
        contents = await file.read()
        ext = file.filename.split(".")[-1] if file.filename else "pdf"
        ext = sanitize_segment(ext.lower())
        file_path = (
            f"documents/{sanitize_segment(user_id)}/{sanitize_segment(documentType)}/"
            f"{datetime.utcnow().timestamp()}-{secrets.token_hex(4)}.{ext}"
        )
        file_url = upload_to_storage_or_local(
            file_path,
            contents,
            file.content_type or "application/octet-stream",
        )

        return {
            "status": "success",
            "message": "Document uploaded",
            "fileUrl": file_url,
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
        contents = await file.read()
        ext = file.filename.split(".")[-1] if file.filename else "m4a"
        ext = sanitize_segment(ext.lower())
        file_path = (
            f"recordings/{sanitize_segment(therapist_uid)}/{sanitize_segment(patientId)}/"
            f"{sanitize_segment(sessionDate)}/{datetime.utcnow().timestamp()}-{secrets.token_hex(4)}.{ext}"
        )
        file_url = upload_to_storage_or_local(file_path, contents, file.content_type)

        return {
            "status": "success",
            "message": "Recording uploaded",
            "fileUrl": file_url,
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
        contents = await file.read()
        ext = file.filename.split(".")[-1] if file.filename else "pdf"
        ext = sanitize_segment(ext.lower())
        file_path = (
            f"exports/{sanitize_segment(therapist_uid)}/{sanitize_segment(appointmentId)}/"
            f"{datetime.utcnow().timestamp()}-{secrets.token_hex(4)}.{ext}"
        )
        file_url = upload_to_storage_or_local(
            file_path,
            contents,
            file.content_type or "application/octet-stream",
        )

        # Update appointment with export URL
        db.update_appointment(appointmentId, {"sessionNotes": file_url})

        return {
            "status": "success",
            "message": "Session exported and uploaded",
            "fileUrl": file_url,
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
        try:
            bucket = get_bucket()
            blob = bucket.blob(file_path)
            if blob.exists():
                blob.delete()
            else:
                local_path = (LOCAL_UPLOADS_ROOT / file_path).resolve()
                if (
                    not str(local_path).startswith(str(LOCAL_UPLOADS_ROOT))
                    or not local_path.exists()
                ):
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="File not found",
                    )
                local_path.unlink()
        except Exception:
            local_path = (LOCAL_UPLOADS_ROOT / file_path).resolve()
            if (
                not str(local_path).startswith(str(LOCAL_UPLOADS_ROOT))
                or not local_path.exists()
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found",
                )
            local_path.unlink()

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
