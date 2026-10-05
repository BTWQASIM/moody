"""
Celery tasks for background processing
Handles AI operations, transcription, summarization, etc.
"""

from celery import Celery
from typing import Optional
import logging
from datetime import datetime

from app.config import settings
from app.ai import gemini_client
from app.db import FirestoreDAO

logger = logging.getLogger(__name__)

# Initialize Celery app
celery_app = Celery(
    "moody_therapist",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

db = FirestoreDAO()


@celery_app.task(bind=True, max_retries=3)
def summarize_session_notes(self, appointment_id: str, content: str):
    """
    Summarize session notes asynchronously
    
    Args:
        appointment_id: ID of the appointment
        content: Session notes or transcript to summarize
    """
    try:
        logger.info(f"Summarizing notes for appointment {appointment_id}")

        summary = gemini_client.summarize_text(content)

        if summary:
            generated_at = datetime.utcnow()
            # Store summary in the appointment and existing clinical summary record.
            db.update_appointment(
                appointment_id,
                {
                    "sessionSummary": summary,
                    "summarizedAt": generated_at,
                    "generatedAt": generated_at,
                },
            )
            db.save_ai_clinical_summary(
                appointment_id,
                summary,
                generated_at,
                self.request.id,
            )

            logger.info(f"Summary stored for appointment {appointment_id}")
            return {
                "status": "completed",
                "appointmentId": appointment_id,
                "summary": summary,
                "generatedAt": f"{generated_at.isoformat()}Z",
            }
        else:
            raise Exception("Summarization returned None")

    except Exception as exc:
        logger.error(
            f"Summarization task failed for appointment {appointment_id}: {str(exc)}"
        )
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3)
def extract_action_items(self, appointment_id: str, content: str):
    """
    Extract action items from session content
    
    Args:
        appointment_id: ID of the appointment
        content: Session content or transcript
    """
    try:
        logger.info(f"Extracting action items for appointment {appointment_id}")

        action_items = gemini_client.extract_action_items(content)

        if action_items:
            # Store action items (could create separate Firestore collection)
            db.update_appointment(
                appointment_id,
                {
                    "actionItems": action_items,
                    "actionItemsExtractedAt": datetime.utcnow(),
                },
            )

            logger.info(f"Action items stored for appointment {appointment_id}")
            return {
                "status": "completed",
                "appointmentId": appointment_id,
                "actionItems": action_items,
            }
        else:
            raise Exception("Action item extraction returned None")

    except Exception as exc:
        logger.error(f"Action item extraction task failed: {str(exc)}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3)
def generate_progress_report(
    self, patient_id: str, therapist_uid: str
):
    """
    Generate progress report from patient sessions
    
    Args:
        patient_id: ID of the patient
        therapist_uid: UID of the therapist
    """
    try:
        logger.info(f"Generating progress report for patient {patient_id}")

        sources = db.get_progress_report_sources(patient_id)
        if not any(sources.values()):
            logger.warning(f"No sessions found for patient {patient_id}")
            return {"status": "no_data"}

        patient = db.get_patient(patient_id) or {}
        patient_name = " ".join(
            part for part in [patient.get("firstName"), patient.get("lastName")] if part
        ) or patient_id
        key_sessions = [
            {
                "source": source_name,
                "records": records,
            }
            for source_name, records in sources.items()
            if records
        ]
        report = gemini_client.prepare_progress_report(
            patient_name,
            sum(len(records) for records in sources.values()),
            key_sessions,
        )

        if report:
            # Store report in Firestore (could create reports collection)
            if patient:
                db.db.collection("patients").document(patient_id).update(
                    {
                        "lastProgressReport": report,
                        "progressReportGeneratedAt": datetime.utcnow(),
                    }
                )

            logger.info(f"Progress report stored for patient {patient_id}")
            return {
                "status": "completed",
                "patientId": patient_id,
                "progressReport": report,
            }
        else:
            raise Exception("Report generation returned None")

    except Exception as exc:
        logger.error(f"Progress report generation failed: {str(exc)}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
