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
            # Store summary in Firestore
            db.update_appointment(
                appointment_id,
                {
                    "sessionSummary": summary,
                    "summarizedAt": datetime.utcnow(),
                },
            )

            logger.info(f"Summary stored for appointment {appointment_id}")
            return {"status": "completed", "appointmentId": appointment_id}
        else:
            raise Exception("Summarization returned None")

    except Exception as exc:
        logger.error(f"Summarization task failed: {str(exc)}")
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3)
def analyze_mood_entry(self, mood_entry_id: str, mood_description: str):
    """
    Analyze mood entry for patterns and concerns
    
    Args:
        mood_entry_id: ID of the mood entry
        mood_description: Description of the mood
    """
    try:
        logger.info(f"Analyzing mood entry {mood_entry_id}")

        analysis = gemini_client.analyze_mood(mood_description)

        if analysis:
            # Update mood entry with analysis
            db.db.collection("moodEntries").document(mood_entry_id).update(
                {
                    "analysis": analysis,
                    "analyzedAt": datetime.utcnow(),
                }
            )

            logger.info(f"Analysis stored for mood entry {mood_entry_id}")
            return {"status": "completed", "moodEntryId": mood_entry_id}
        else:
            raise Exception("Analysis returned None")

    except Exception as exc:
        logger.error(f"Mood analysis task failed: {str(exc)}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3)
def generate_clinical_notes(
    self,
    appointment_id: str,
    transcript: str,
    patient_name: str,
    session_date: str,
):
    """
    Generate clinical notes from session transcript
    
    Args:
        appointment_id: ID of the appointment
        transcript: Session transcript or recording text
        patient_name: Name of the patient
        session_date: Date of the session
    """
    try:
        logger.info(f"Generating clinical notes for appointment {appointment_id}")

        notes = gemini_client.generate_session_notes(
            transcript, patient_name, session_date
        )

        if notes:
            # Create clinical note in Firestore
            from app.models import ClinicalNote

            clinical_note = ClinicalNote(
                id="",
                patientId="",  # Will be set from appointment data
                therapistUid="",  # Will be set from appointment data
                appointmentId=appointment_id,
                content=notes,
                confidential=True,
                tags=["ai_generated", "from_transcript"],
                createdAt=datetime.utcnow(),
                updatedAt=datetime.utcnow(),
            )

            note_id = db.create_clinical_note(clinical_note)

            # Update appointment with reference to notes
            db.update_appointment(
                appointment_id,
                {
                    "clinicalNoteId": note_id,
                    "notesGeneratedAt": datetime.utcnow(),
                },
            )

            logger.info(f"Clinical notes stored for appointment {appointment_id}")
            return {"status": "completed", "appointmentId": appointment_id}
        else:
            raise Exception("Note generation returned None")

    except Exception as exc:
        logger.error(f"Clinical notes generation failed: {str(exc)}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3)
def assess_patient_risk(self, patient_id: str, context: str):
    """
    Assess risk level based on patient context
    
    Args:
        patient_id: ID of the patient
        context: Context for risk assessment (mood entries, notes, etc.)
    """
    try:
        logger.info(f"Assessing risk for patient {patient_id}")

        assessment = gemini_client.assess_risk_level(context)

        if assessment:
            # Store assessment in Firestore
            from app.models import RiskAlert, RiskLevel

            # Parse risk level from assessment
            risk_level = RiskLevel.MEDIUM  # default
            if "critical" in assessment.get("assessment", "").lower():
                risk_level = RiskLevel.CRITICAL
            elif "high" in assessment.get("assessment", "").lower():
                risk_level = RiskLevel.HIGH
            elif "low" in assessment.get("assessment", "").lower():
                risk_level = RiskLevel.LOW

            # Create alert if risk level is medium or higher
            if risk_level in [RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]:
                alert = RiskAlert(
                    id="",
                    patientId=patient_id,
                    therapistUid="",  # Will be set from patient data
                    title="AI Risk Assessment Alert",
                    description=assessment.get("assessment", ""),
                    riskLevel=risk_level,
                    source="ai_assessment",
                    isAcknowledged=False,
                    createdAt=datetime.utcnow(),
                )

                db.create_risk_alert(alert)
                logger.info(f"Risk alert created for patient {patient_id}")

            return {"status": "completed", "patientId": patient_id}
        else:
            raise Exception("Assessment returned None")

    except Exception as exc:
        logger.error(f"Risk assessment task failed: {str(exc)}")
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
            return {"status": "completed", "appointmentId": appointment_id}
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

        # Fetch patient and recent sessions
        patient = db.get_patient(patient_id)
        appointments = db.get_appointments_for_therapist(therapist_uid)
        patient_appointments = [
            a for a in appointments if a.get("patientId") == patient_id
        ]

        # Gather session summaries
        key_sessions = []
        for appt in patient_appointments[-5:]:  # Last 5 sessions
            if appt.get("sessionSummary"):
                key_sessions.append(appt.get("sessionSummary"))

        if not key_sessions:
            logger.warning(f"No sessions found for patient {patient_id}")
            return {"status": "no_data"}

        report = gemini_client.prepare_progress_report(
            patient.get("firstName", "") + " " + patient.get("lastName", ""),
            len(patient_appointments),
            key_sessions,
        )

        if report:
            # Store report in Firestore (could create reports collection)
            db.db.collection("patients").document(patient_id).update(
                {
                    "lastProgressReport": report,
                    "progressReportGeneratedAt": datetime.utcnow(),
                }
            )

            logger.info(f"Progress report stored for patient {patient_id}")
            return {"status": "completed", "patientId": patient_id}
        else:
            raise Exception("Report generation returned None")

    except Exception as exc:
        logger.error(f"Progress report generation failed: {str(exc)}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
