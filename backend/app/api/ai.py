"""
AI-powered operations API endpoints
Integrates Gemini models for transcription, summarization, and analysis
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header, BackgroundTasks
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel
from datetime import datetime

from app.db import FirestoreDAO
from app.tasks import (
    summarize_session_notes,
    analyze_mood_entry,
    generate_clinical_notes,
    assess_patient_risk,
    extract_action_items,
    generate_progress_report,
)

router = APIRouter(prefix="/api/ai", tags=["AI"])
db = FirestoreDAO()


class SummarizeNotesRequest(BaseModel):
    appointmentId: str
    content: str


class AnalyzeMoodRequest(BaseModel):
    moodEntryId: str
    moodDescription: str


class GenerateNotesRequest(BaseModel):
    appointmentId: str
    transcript: str
    patientName: str
    sessionDate: str


class RiskAssessmentRequest(BaseModel):
    patientId: str
    context: str


class ExtractItemsRequest(BaseModel):
    appointmentId: str
    content: str


class ProgressReportRequest(BaseModel):
    patientId: str


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


@router.post("/summarize")
async def submit_summarize_task(
    request: SummarizeNotesRequest,
    authorization: str = Header(...),
):
    """
    Queue a task to summarize session notes asynchronously
    
    Returns immediately with task ID. Check task status separately.
    """
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        # Verify appointment belongs to therapist
        appointment = db.get_appointment(request.appointmentId)
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

        # Submit task to Celery queue
        task = summarize_session_notes.delay(
            request.appointmentId, request.content
        )

        return {
            "status": "queued",
            "taskId": task.id,
            "message": "Summarization task queued",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue task: {str(err)}",
        )


@router.post("/analyze-mood")
async def submit_mood_analysis(
    request: AnalyzeMoodRequest,
    authorization: str = Header(...),
):
    """
    Queue a task to analyze mood entry for patterns and concerns
    """
    decoded = verify_token(authorization)

    try:
        # Submit task to Celery queue
        task = analyze_mood_entry.delay(
            request.moodEntryId, request.moodDescription
        )

        return {
            "status": "queued",
            "taskId": task.id,
            "message": "Mood analysis task queued",
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue task: {str(err)}",
        )


@router.post("/generate-notes")
async def submit_clinical_notes(
    request: GenerateNotesRequest,
    authorization: str = Header(...),
):
    """
    Queue a task to generate clinical notes from transcript
    """
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        # Verify appointment belongs to therapist
        appointment = db.get_appointment(request.appointmentId)
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

        # Submit task to Celery queue
        task = generate_clinical_notes.delay(
            request.appointmentId,
            request.transcript,
            request.patientName,
            request.sessionDate,
        )

        return {
            "status": "queued",
            "taskId": task.id,
            "message": "Clinical notes generation task queued",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue task: {str(err)}",
        )


@router.post("/assess-risk")
async def submit_risk_assessment(
    request: RiskAssessmentRequest,
    authorization: str = Header(...),
):
    """
    Queue a task to assess patient risk level
    """
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

        # Submit task to Celery queue
        task = assess_patient_risk.delay(request.patientId, request.context)

        return {
            "status": "queued",
            "taskId": task.id,
            "message": "Risk assessment task queued",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue task: {str(err)}",
        )


@router.post("/extract-items")
async def submit_extract_items(
    request: ExtractItemsRequest,
    authorization: str = Header(...),
):
    """
    Queue a task to extract action items from session content
    """
    decoded = verify_token(authorization)
    therapist_uid = decoded.get("uid")

    try:
        # Verify appointment belongs to therapist
        appointment = db.get_appointment(request.appointmentId)
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

        # Submit task to Celery queue
        task = extract_action_items.delay(request.appointmentId, request.content)

        return {
            "status": "queued",
            "taskId": task.id,
            "message": "Action items extraction task queued",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue task: {str(err)}",
        )


@router.post("/progress-report")
async def submit_progress_report(
    request: ProgressReportRequest,
    authorization: str = Header(...),
):
    """
    Queue a task to generate patient progress report
    """
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

        # Submit task to Celery queue
        task = generate_progress_report.delay(request.patientId, therapist_uid)

        return {
            "status": "queued",
            "taskId": task.id,
            "message": "Progress report generation task queued",
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue task: {str(err)}",
        )


@router.get("/task-status/{task_id}")
async def get_task_status(
    task_id: str,
    authorization: str = Header(...),
):
    """
    Check the status of a queued AI task
    """
    decoded = verify_token(authorization)

    try:
        from app.tasks import celery_app

        task_result = celery_app.AsyncResult(task_id)

        return {
            "taskId": task_id,
            "status": task_result.status,
            "result": task_result.result if task_result.status == "SUCCESS" else None,
            "error": str(task_result.info)
            if task_result.status == "FAILURE"
            else None,
        }
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task status: {str(err)}",
        )
