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
    PatientContactInfo,
    PatientStatus,
    RiskLevel,
    AppointmentDetails,
    ServiceOffering,
    MoodEntry,
    ClinicalNote,
    RiskAlert,
    Notification,
    AuditLog,
    MobileMoodCheckin,
    MobileJournalEntry,
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

    def _split_display_name(self, name: str) -> tuple[str, str]:
        parts = (name or "").strip().split()
        if not parts:
            return "Patient", ""
        if len(parts) == 1:
            return parts[0], ""
        return parts[0], " ".join(parts[1:])

    def find_patient_by_firebase_uid(
        self, therapist_uid: str, firebase_uid: str
    ) -> Optional[Dict[str, Any]]:
        """Find a portal patient linked to a mobile Firebase Auth UID."""
        if not self.db:
            return None

        docs = (
            self.db.collection("patients")
            .where("therapistUid", "==", therapist_uid)
            .stream()
        )
        for doc in docs:
            data = cast(Any, doc).to_dict()
            if not isinstance(data, dict):
                continue
            if data.get("firebaseUid") == firebase_uid:
                data["id"] = cast(Any, doc).id
                return data
        return None

    def ensure_patient_from_mobile_appointment(
        self, therapist_uid: str, appointment: Dict[str, Any]
    ) -> str:
        """Create or update a portal patient when a mobile request is accepted."""
        if not self.db:
            raise Exception("Firestore not configured")

        firebase_uid = str(appointment.get("patientId") or "").strip()
        if not firebase_uid:
            raise ValueError("Appointment is missing patientId")

        existing = self.find_patient_by_firebase_uid(therapist_uid, firebase_uid)
        if existing:
            patient_id = str(existing["id"])
            updates: Dict[str, Any] = {"status": PatientStatus.ACTIVE.value}
            if appointment.get("patientName"):
                first, last = self._split_display_name(
                    str(appointment.get("patientName"))
                )
                updates["firstName"] = first
                updates["lastName"] = last
            if appointment.get("patientEmail"):
                updates["email"] = appointment.get("patientEmail")
            self.update_patient(patient_id, updates)
        else:
            user_doc = self.db.collection("users").document(firebase_uid).get()
            user_data = user_doc.to_dict() if user_doc.exists else {}

            display_name = (
                str(appointment.get("patientName") or "")
                or str((user_data or {}).get("name") or "")
                or "Patient"
            )
            first_name, last_name = self._split_display_name(display_name)
            email = (
                str(appointment.get("patientEmail") or "")
                or str((user_data or {}).get("email") or "")
            )

            profile = PatientProfile(
                id="",
                therapistUid=therapist_uid,
                firebaseUid=firebase_uid,
                firstName=first_name,
                lastName=last_name,
                dateOfBirth="",
                email=email,
                phone=str((user_data or {}).get("phone") or ""),
                address="",
                city="",
                state="",
                zipCode="",
                emergencyContact=PatientContactInfo(
                    emergencyName="",
                    emergencyPhone="",
                    emergencyRelation="",
                ),
                status=PatientStatus.ACTIVE,
                riskLevel=RiskLevel.LOW,
            )
            patient_id = self.create_patient(profile)

        try:
            self.db.collection("users").document(firebase_uid).set(
                {"therapistUid": therapist_uid},
                merge=True,
            )
        except Exception:
            pass

        return patient_id

    def get_patient(self, patient_id: str) -> Optional[Dict[str, Any]]:
        """Get a patient profile by ID"""
        if not self.db:
            return None
        doc = self.db.collection("patients").document(patient_id).get()
        data = self._doc_data(doc)
        if data is not None:
            data["id"] = patient_id
        return data

    def get_patients_for_therapist(self, therapist_uid: str) -> List[Dict[str, Any]]:
        """Get all patients for a therapist"""
        if not self.db:
            return []
        docs = (
            self.db.collection("patients")
            .where("therapistUid", "==", therapist_uid)
            .stream()
        )
        rows: List[Dict[str, Any]] = []
        for doc in docs:
            data = cast(Any, doc).to_dict()
            if not isinstance(data, dict):
                continue
            data["id"] = cast(Any, doc).id
            rows.append(data)
        rows.sort(
            key=lambda patient: (
                str(patient.get("lastName", "")).lower(),
                str(patient.get("firstName", "")).lower(),
            )
        )
        return rows

    def create_patient(self, profile: PatientProfile) -> str:
        """Create a new patient profile"""
        if not self.db:
            raise Exception("Firestore not configured")
        doc_ref = self.db.collection("patients").add(
            profile.model_dump(mode="json", by_alias=False)
        )
        patient_id = doc_ref[1].id
        doc_ref[1].update({"id": patient_id})
        return patient_id

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

    def _therapist_uid_aliases(self, therapist_uid: str) -> set[str]:
        """Collect all identifiers that may appear as appointments.therapistUid.

        Mobile app historically stored therapist Firestore doc IDs (e.g. TP_001)
        while the portal authenticates with Firebase Auth UIDs. Include both.
        """
        aliases: set[str] = {therapist_uid}
        if not self.db:
            return aliases

        matches = (
            self.db.collection("therapists")
            .where("uid", "==", therapist_uid)
            .stream()
        )
        matched_document_ids: set[str] = set()
        for match in matches:
            match_id = cast(Any, match).id
            matched_document_ids.add(match_id)
            aliases.add(match_id)
            data = cast(Any, match).to_dict()
            if isinstance(data, dict):
                profile_uid = data.get("uid")
                if isinstance(profile_uid, str) and profile_uid:
                    aliases.add(profile_uid)

        if therapist_uid not in matched_document_ids:
            doc = self.db.collection("therapists").document(therapist_uid).get()
            if doc.exists:
                data = doc.to_dict() or {}
                aliases.add(doc.id)
                profile_uid = data.get("uid")
                if isinstance(profile_uid, str) and profile_uid:
                    aliases.add(profile_uid)

        return aliases

    def get_appointment(self, appointment_id: str) -> Optional[Dict[str, Any]]:
        """Get an appointment by ID"""
        if not self.db:
            return None
        doc = self.db.collection("appointments").document(appointment_id).get()
        data = self._doc_data(doc)
        if data is not None:
            data["id"] = appointment_id
        return data

    def enrich_appointments_with_patient_refs(
        self,
        therapist_uid: str,
        appointments: List[Dict[str, Any]],
        patients: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Attach existing portal patient IDs for mobile appointments."""
        patients_by_firebase_uid = {
            str(patient.get("firebaseUid")): patient
            for patient in (
                patients
                if patients is not None
                else self.get_patients_for_therapist(therapist_uid)
            )
            if patient.get("firebaseUid")
        }
        enriched: List[Dict[str, Any]] = []
        for apt in appointments:
            row = dict(apt)
            firebase_uid = str(row.get("patientId") or "")

            if (
                not row.get("portalPatientId")
                and row.get("source") == "mobile"
                and firebase_uid
            ):
                patient = patients_by_firebase_uid.get(firebase_uid)
                if patient:
                    row["portalPatientId"] = patient["id"]

            enriched.append(row)
        return enriched

    def get_appointments_for_therapist(
        self, therapist_uid: str, start_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get appointments for a therapist"""
        if not self.db:
            return []

        aliases = self._therapist_uid_aliases(therapist_uid)
        rows_by_id: Dict[str, Dict[str, Any]] = {}
        for alias in aliases:
            docs = (
                self.db.collection("appointments")
                .where("therapistUid", "==", alias)
                .stream()
            )
            for doc in docs:
                data = cast(Any, doc).to_dict()
                if not isinstance(data, dict):
                    continue
                data["id"] = cast(Any, doc).id
                rows_by_id[data["id"]] = data
        rows = list(rows_by_id.values())

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

        if "scheduledAt" in updates:
            scheduled = updates["scheduledAt"]
            if isinstance(scheduled, str):
                updates["scheduledAt"] = datetime.fromisoformat(
                    scheduled.replace("Z", "+00:00")
                )
            updates["rescheduledAt"] = datetime.utcnow()

        updates["updatedAt"] = datetime.utcnow()
        self.db.collection("appointments").document(appointment_id).update(updates)
        return True

    def save_ai_clinical_summary(
        self,
        appointment_id: str,
        summary: str,
        generated_at: datetime,
        task_id: str,
    ) -> None:
        """Create an idempotent AI summary and retain the latest three unsigned entries."""
        if not self.db:
            raise Exception("Firestore not configured")

        appointment = self.get_appointment(appointment_id)
        if not appointment:
            raise ValueError(f"Appointment not found: {appointment_id}")

        collection = self.db.collection("clincal_summaries")
        summary_data = {
            "appointmentID": appointment_id,
            "patientID": appointment.get("patientId"),
            "therapistID": appointment.get("therapistUid"),
            "generatedNotes": summary,
            "reviewedAndSigned": False,
            "timestamp": generated_at,
            "taskID": task_id,
        }

        @firestore.transactional
        def create_if_missing(transaction: Any) -> bool:
            matches = list(
                transaction.get(
                    collection.where("appointmentID", "==", appointment_id)
                )
            )
            if any(
                (document.to_dict() or {}).get("taskID") == task_id
                for document in matches
            ):
                return False

            transaction.create(collection.document(), summary_data)
            return True

        if not create_if_missing(self.db.transaction()):
            return

        updated_matches = list(
            collection.where("appointmentID", "==", appointment_id).stream()
        )
        unsigned_matches = [
            document
            for document in updated_matches
            if (document.to_dict() or {}).get("reviewedAndSigned") is not True
        ]
        unsigned_matches.sort(
            key=lambda document: self._scheduled_at_epoch(
                (document.to_dict() or {}).get("timestamp")
            ),
            reverse=True,
        )
        for document in unsigned_matches[3:]:
            document.reference.delete()

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

    # ========================================================================
    # Mobile App Data — read-only access for the therapist portal
    # These collections are written directly by the Flutter patient app.
    # ========================================================================

    def get_mobile_user_profile(
        self, firebase_uid: str
    ) -> Optional[Dict[str, Any]]:
        """Return the mobile app user profile from users/{firebase_uid}."""
        if not self.db:
            return None
        doc = self.db.collection("users").document(firebase_uid).get()
        return self._doc_data(doc)

    def get_mobile_mood_checkins(
        self, firebase_uid: str, limit: int = 30
    ) -> List[Dict[str, Any]]:
        """Return recent mood check-ins for a patient identified by Firebase UID."""
        if not self.db:
            return []
        docs = (
            self.db.collection("mood_checkins")
            .where("userId", "==", firebase_uid)
            .stream()
        )
        rows: List[Dict[str, Any]] = []
        for doc in docs:
            data = cast(Any, doc).to_dict()
            if not isinstance(data, dict):
                continue
            data["id"] = cast(Any, doc).id
            rows.append(data)
        rows = self._sort_by_datetime_field(rows, "timestamp", reverse=True)
        return rows[:limit]

    def get_mobile_journal_entries(
        self, firebase_uid: str, limit: int = 30
    ) -> List[Dict[str, Any]]:
        """Return recent journal entries for a patient identified by Firebase UID.

        Queries the `journal_entries` collection (written by the Flutter app)
        where `userId == firebase_uid`.
        """
        if not self.db:
            return []
        docs = (
            self.db.collection("journal_entries")
            .where("userId", "==", firebase_uid)
            .stream()
        )
        rows: List[Dict[str, Any]] = []
        for doc in docs:
            data = cast(Any, doc).to_dict()
            if not isinstance(data, dict):
                continue
            data["id"] = cast(Any, doc).id
            rows.append(data)
        rows = self._sort_by_datetime_field(rows, "timestamp", reverse=True)
        return rows[:limit]

    def get_progress_report_sources(
        self, patient_id: str, limit: int = 30
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Read existing mood, journal, and clinical records for a patient."""
        if not self.db:
            return {"mood_checkins": [], "journals": [], "clinical_summaries": []}

        firebase_uids: set[str] = set()
        patient = self.get_patient(patient_id)
        if patient and patient.get("firebaseUid"):
            firebase_uids.add(str(patient["firebaseUid"]))

        mood_checkins: List[Dict[str, Any]] = []
        for firebase_uid in firebase_uids:
            mood_checkins.extend(self.get_mobile_mood_checkins(firebase_uid, limit))

        journals: List[Dict[str, Any]] = []
        docs = self.db.collection("journals").where(
            "patientID", "==", patient_id
        ).stream()
        journals.extend(self._stream_data(docs))

        clinical_docs = self.db.collection("clincal_summaries").where(
            "patientID", "==", patient_id
        ).stream()
        clinical_summaries = self._stream_data(clinical_docs)

        return {
            "mood_checkins": self._sort_by_datetime_field(
                mood_checkins, "timestamp", reverse=True
            )[:limit],
            "journals": self._sort_by_datetime_field(
                journals, "timestamp", reverse=True
            )[:limit],
            "clinical_summaries": self._sort_by_datetime_field(
                clinical_summaries, "timestamp", reverse=True
            )[:limit],
        }

    def link_patient_firebase_uid(
        self, patient_id: str, firebase_uid: str
    ) -> bool:
        """Store the patient's Firebase Auth UID on their portal `patients` document.

        This is the bridge between the mobile app user and the portal patient
        record. Once set, the portal can query mobile-side collections by UID.
        """
        if not self.db:
            return False
        self.db.collection("patients").document(patient_id).update({
            "firebaseUid": firebase_uid,
            "updatedAt": datetime.utcnow(),
        })
        return True

    def unlink_patient_firebase_uid(self, patient_id: str) -> bool:
        """Remove the Firebase UID link from a patient's portal document."""
        if not self.db:
            return False
        self.db.collection("patients").document(patient_id).update({
            "firebaseUid": None,
            "updatedAt": datetime.utcnow(),
        })
        return True
