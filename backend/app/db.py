"""
Data Access Layer for Firestore collections
Provides methods for CRUD operations and queries
"""

from typing import List, Optional, Any, Dict, Iterable, cast
from datetime import datetime
from firebase_admin import firestore
from app.firebase import get_db_client
from app.models import (
    TherapistProfile,
    PatientProfile,
    AppointmentDetails,
    ServiceOffering,
    MoodEntry,
    ClinicalNote,
    RiskAlert,
    Message,
    MessageThread,
    Notification,
    AuditLog,
)


class FirestoreDAO:
    """Data Access Object for Firestore operations"""

    def __init__(self):
        self.db = get_db_client()

    def _doc_data(self, doc: Any) -> Optional[Dict[str, Any]]:
        """Normalize Firestore snapshot access for static typing and runtime safety."""
        snapshot = cast(Any, doc)
        if not snapshot or not getattr(snapshot, "exists", False):
            return None
        data = snapshot.to_dict()
        return data if isinstance(data, dict) else None

    def _stream_data(self, docs: Iterable[Any]) -> List[Dict[str, Any]]:
        """Collect stream results while filtering non-dict entries."""
        rows: List[Dict[str, Any]] = []
        for doc in docs:
            data = cast(Any, doc).to_dict()
            if isinstance(data, dict):
                rows.append(data)
        return rows

    def _scheduled_at_epoch(self, value: Any) -> float:
        """Normalize scheduledAt values to epoch seconds for safe comparisons."""
        if isinstance(value, datetime):
            try:
                return value.timestamp()
            except Exception:
                return 0.0
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
            except ValueError:
                return 0.0
        return 0.0

    def _sort_by_datetime_field(
        self,
        rows: List[Dict[str, Any]],
        field: str,
        *,
        reverse: bool = False,
    ) -> List[Dict[str, Any]]:
        """Sort rows by a datetime-like field using epoch normalization."""
        return sorted(
            rows,
            key=lambda item: self._scheduled_at_epoch(item.get(field)),
            reverse=reverse,
        )

    def _sort_by_scheduled_at(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sort appointments by scheduledAt safely without relying on Firestore indexes."""
        return sorted(rows, key=lambda item: self._scheduled_at_epoch(item.get("scheduledAt")))

    # ========================================================================
    # Therapist Operations
    # ========================================================================

    def get_therapist(self, uid: str) -> Optional[Dict[str, Any]]:
        """Get a therapist profile by UID"""
        if not self.db:
            return None
        doc = self.db.collection("therapists").document(uid).get()
        return self._doc_data(doc)

    def create_therapist(self, profile: TherapistProfile) -> str:
        """Create a new therapist profile (UID as document ID)"""
        if not self.db:
            raise Exception("Firestore not configured")
        self.db.collection("therapists").document(profile.uid).set(
            profile.model_dump(by_alias=False)
        )
        return profile.uid

    def update_therapist(self, uid: str, updates: Dict[str, Any]) -> bool:
        """Update therapist profile"""
        if not self.db:
            return False
        updates["updatedAt"] = datetime.utcnow()
        self.db.collection("therapists").document(uid).update(updates)
        return True

    # ========================================================================
    # Patient Operations
    # ========================================================================

    def get_patient(self, patient_id: str) -> Optional[Dict[str, Any]]:
        """Get a patient profile by ID"""
        if not self.db:
            return None
        doc = self.db.collection("patients").document(patient_id).get()
        return self._doc_data(doc)

    def get_patients_for_therapist(self, therapist_uid: str) -> List[Dict[str, Any]]:
        """Get all patients for a therapist"""
        if not self.db:
            return []
        docs = (
            self.db.collection("patients")
            .where("therapistUid", "==", therapist_uid)
            .stream()
        )
        return self._stream_data(docs)

    def create_patient(self, profile: PatientProfile) -> str:
        """Create a new patient profile"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("patients").add(profile.model_dump(by_alias=False))
        return doc_ref[1].id

    def update_patient(self, patient_id: str, updates: Dict[str, Any]) -> bool:
        """Update patient profile"""
        if not self.db:
            return False
        updates["updatedAt"] = datetime.utcnow()
        self.db.collection("patients").document(patient_id).update(updates)
        return True

    def delete_patient(self, patient_id: str) -> bool:
        """Delete a patient (mark as inactive instead of hard delete)"""
        if not self.db:
            return False
        self.db.collection("patients").document(patient_id).update({
            "status": "inactive",
            "updatedAt": datetime.utcnow()
        })
        return True

    # ========================================================================
    # Appointment Operations
    # ========================================================================

    def get_appointment(self, appointment_id: str) -> Optional[Dict[str, Any]]:
        """Get an appointment by ID"""
        if not self.db:
            return None
        doc = self.db.collection("appointments").document(appointment_id).get()
        return self._doc_data(doc)

    def get_appointments_for_therapist(
        self, therapist_uid: str, start_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get appointments for a therapist"""
        if not self.db:
            return []
        docs = (
            self.db.collection("appointments")
            .where("therapistUid", "==", therapist_uid)
            .stream()
        )
        rows = self._stream_data(docs)
        if start_date:
            threshold = self._scheduled_at_epoch(start_date)
            rows = [
                row
                for row in rows
                if self._scheduled_at_epoch(row.get("scheduledAt")) >= threshold
            ]
        return self._sort_by_scheduled_at(rows)

    def get_appointments_for_patient(self, patient_id: str) -> List[Dict[str, Any]]:
        """Get appointments for a patient"""
        if not self.db:
            return []
        docs = (
            self.db.collection("appointments")
            .where("patientId", "==", patient_id)
            .stream()
        )
        return self._sort_by_scheduled_at(self._stream_data(docs))

    def create_appointment(self, appointment: AppointmentDetails) -> str:
        """Create a new appointment"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("appointments").add(appointment.model_dump(by_alias=False))
        return doc_ref[1].id

    def update_appointment(self, appointment_id: str, updates: Dict[str, Any]) -> bool:
        """Update appointment"""
        if not self.db:
            return False
        updates["updatedAt"] = datetime.utcnow()
        self.db.collection("appointments").document(appointment_id).update(updates)
        return True

    # ========================================================================
    # Service Operations
    # ========================================================================

    def get_services_for_therapist(self, therapist_uid: str) -> List[Dict[str, Any]]:
        """Get all active services for a therapist"""
        if not self.db:
            return []
        # Query only by therapist UID to avoid composite-index requirements,
        # then filter active services in application code.
        docs = (
            self.db.collection("services")
            .where("therapistUid", "==", therapist_uid)
            .stream()
        )
        services: List[Dict[str, Any]] = []
        for doc in docs:
            data = cast(Any, doc).to_dict()
            if not isinstance(data, dict):
                continue
            if not data.get("id"):
                data["id"] = cast(Any, doc).id
            services.append(data)
        for row in services:
            if "isActive" not in row:
                row["isActive"] = True
        return [row for row in services if row.get("isActive", True)]

    def create_service(self, service: ServiceOffering) -> str:
        """Create a new service offering"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("services").document()
        payload = service.model_dump(by_alias=False)
        payload["id"] = doc_ref.id
        doc_ref.set(payload)
        return doc_ref.id

    def update_service(self, service_id: str, updates: Dict[str, Any]) -> bool:
        """Update service"""
        if not self.db:
            return False
        updates["updatedAt"] = datetime.utcnow()
        self.db.collection("services").document(service_id).update(updates)
        return True

    # ========================================================================
    # Mood Entry Operations
    # ========================================================================

    def get_mood_entries_for_patient(
        self, patient_id: str, limit: int = 30
    ) -> List[Dict[str, Any]]:
        """Get recent mood entries for a patient"""
        if not self.db:
            return []
        docs = (
            self.db.collection("moodEntries")
            .where("patientId", "==", patient_id)
            .stream()
        )
        rows = self._stream_data(docs)
        rows = self._sort_by_datetime_field(rows, "recordedAt", reverse=True)
        return rows[:limit]

    def create_mood_entry(self, entry: MoodEntry) -> str:
        """Create a new mood entry"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("moodEntries").add(entry.model_dump(by_alias=False))
        return doc_ref[1].id

    # ========================================================================
    # Clinical Note Operations
    # ========================================================================

    def get_notes_for_patient(self, patient_id: str) -> List[Dict[str, Any]]:
        """Get all clinical notes for a patient"""
        if not self.db:
            return []
        docs = (
            self.db.collection("clinicalNotes")
            .where("patientId", "==", patient_id)
            .stream()
        )
        return self._sort_by_datetime_field(
            self._stream_data(docs),
            "createdAt",
            reverse=True,
        )

    def create_clinical_note(self, note: ClinicalNote) -> str:
        """Create a new clinical note"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("clinicalNotes").add(note.model_dump(by_alias=False))
        return doc_ref[1].id

    # ========================================================================
    # Risk Alert Operations
    # ========================================================================

    def get_risk_alerts_for_therapist(self, therapist_uid: str) -> List[Dict[str, Any]]:
        """Get unacknowledged risk alerts for a therapist"""
        if not self.db:
            return []
        docs = (
            self.db.collection("riskAlerts")
            .where("therapistUid", "==", therapist_uid)
            .stream()
        )
        rows = [
            row
            for row in self._stream_data(docs)
            if not row.get("isAcknowledged", False)
        ]
        return self._sort_by_datetime_field(rows, "createdAt", reverse=True)

    def create_risk_alert(self, alert: RiskAlert) -> str:
        """Create a new risk alert"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("riskAlerts").add(alert.model_dump(by_alias=False))
        return doc_ref[1].id

    def acknowledge_risk_alert(self, alert_id: str, therapist_uid: str) -> bool:
        """Mark a risk alert as acknowledged"""
        if not self.db:
            return False
        self.db.collection("riskAlerts").document(alert_id).update({
            "isAcknowledged": True,
            "acknowledgedAt": datetime.utcnow(),
            "acknowledgedBy": therapist_uid,
        })
        return True

    # ========================================================================
    # Message Operations
    # ========================================================================

    def get_message_threads_for_therapist(self, therapist_uid: str) -> List[Dict[str, Any]]:
        """Get all message threads for a therapist"""
        if not self.db:
            return []
        docs = (
            self.db.collection("messageThreads")
            .where("therapistUid", "==", therapist_uid)
            .stream()
        )
        rows = [
            row
            for row in self._stream_data(docs)
            if row.get("isActive", True)
        ]
        return self._sort_by_datetime_field(rows, "lastMessageAt", reverse=True)

    def get_messages_for_thread(self, thread_id: str) -> List[Dict[str, Any]]:
        """Get all messages in a thread"""
        if not self.db:
            return []
        docs = (
            self.db.collection("messages")
            .where("threadId", "==", thread_id)
            .stream()
        )
        return self._sort_by_datetime_field(self._stream_data(docs), "createdAt")

    def create_message_thread(self, thread: MessageThread) -> str:
        """Create a new message thread"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("messageThreads").add(thread.model_dump(by_alias=False))
        return doc_ref[1].id

    def create_message(self, message: Message) -> str:
        """Create a new message"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("messages").add(message.model_dump(by_alias=False))
        return doc_ref[1].id

    # ========================================================================
    # Notification Operations
    # ========================================================================

    def get_notifications_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        """Get notifications for a user"""
        if not self.db:
            return []
        docs = (
            self.db.collection("notifications")
            .where("userId", "==", user_id)
            .stream()
        )
        rows = self._sort_by_datetime_field(
            self._stream_data(docs),
            "createdAt",
            reverse=True,
        )
        return rows[:50]

    def create_notification(self, notification: Notification) -> str:
        """Create a new notification"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("notifications").add(
            notification.model_dump(by_alias=False)
        )
        return doc_ref[1].id

    # ========================================================================
    # Audit Log Operations
    # ========================================================================

    def log_action(self, log: AuditLog) -> str:
        """Log an action for compliance tracking"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("auditLogs").add(log.model_dump(by_alias=False))
        return doc_ref[1].id
