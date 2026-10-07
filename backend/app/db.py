"""
Data Access Layer for Firestore collections
Provides methods for CRUD operations and queries
"""

from typing import List, Optional, Any, Dict, Iterable, cast
from datetime import datetime
from firebase_admin import firestore
from app.firebase import get_db_client
from app.field_encryption import PatientFieldEncryption
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
        self._patient_field_encryption = PatientFieldEncryption.from_environment()

    def _protect_patient_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Encrypt configured patient fields before a Firestore write."""
        protected = dict(data)
        if "clinicalNotes" in protected:
            protected["clinicalNotes"] = self._patient_field_encryption.encrypt_notes(
                protected["clinicalNotes"]
            )
        return protected

    def _reveal_patient_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Decrypt configured patient fields after a Firestore read."""
        revealed = dict(data)
        if "clinicalNotes" in revealed:
            revealed["clinicalNotes"] = self._patient_field_encryption.decrypt_notes(
                revealed["clinicalNotes"]
            )
        return revealed

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
                if not data.get("id"):
                    data["id"] = cast(Any, doc).id
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
                return self._reveal_patient_fields(data)
        return None

    def find_patients_by_firebase_uid(
        self, firebase_uid: str
    ) -> List[Dict[str, Any]]:
        """Find every portal record linked to a mobile Firebase Auth account."""
        if not self.db:
            return []

        docs = (
            self.db.collection("patients")
            .where("firebaseUid", "==", firebase_uid)
            .stream()
        )
        rows: List[Dict[str, Any]] = []
        for doc in docs:
            data = cast(Any, doc).to_dict()
            if not isinstance(data, dict):
                continue
            data["id"] = cast(Any, doc).id
            rows.append(self._reveal_patient_fields(data))
        return rows

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
            return self._reveal_patient_fields(data)
        return None

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
            rows.append(self._reveal_patient_fields(data))
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
        payload = self._protect_patient_fields(
            profile.model_dump(mode="json", by_alias=False)
        )
        doc_ref = self.db.collection("patients").add(payload)
        patient_id = doc_ref[1].id
        doc_ref[1].update({"id": patient_id})
        return patient_id

    def update_patient(self, patient_id: str, updates: Dict[str, Any]) -> bool:
        """Update patient profile"""
        if not self.db:
            return False
        protected_updates = self._protect_patient_fields(updates)
        protected_updates["updatedAt"] = datetime.utcnow()
        self.db.collection("patients").document(patient_id).update(protected_updates)
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
        """Get appointments by Firebase UID or portal patient document ID."""
        if not self.db:
            return []

        rows_by_id: Dict[str, Dict[str, Any]] = {}
        for field in ("patientId", "portalPatientId"):
            docs = (
                self.db.collection("appointments")
                .where(field, "==", patient_id)
                .stream()
            )
            for doc in docs:
                data = cast(Any, doc).to_dict()
                if not isinstance(data, dict):
                    continue
                data["id"] = cast(Any, doc).id
                rows_by_id[data["id"]] = data

        return self._sort_by_scheduled_at(list(rows_by_id.values()))

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
        portal_patient_id = appointment.get("portalPatientId")
        firebase_patient_id = appointment.get("patientId")
        summary_data = {
            "appointmentID": appointment_id,
            "patientID": portal_patient_id or firebase_patient_id,
            "firebasePatientId": firebase_patient_id,
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
        """Get all services for a therapist, including inactive offerings."""
        if not self.db:
            return []
        # Query only by therapist UID to avoid composite-index requirements.
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
        return services

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
        ref = self.db.collection("riskAlerts").document(alert_id)
        alert = self._doc_data(ref.get())
        if not alert or alert.get("therapistUid") != therapist_uid:
            return False
        ref.update({
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

    def mark_notifications_read(self, user_id: str) -> int:
        """Mark the authenticated user's stored notifications as read."""
        if not self.db:
            return 0
        docs = (
            self.db.collection("notifications")
            .where("userId", "==", user_id)
            .stream()
        )
        updated = 0
        for doc in docs:
            data = cast(Any, doc).to_dict() or {}
            if data.get("isRead", False):
                continue
            cast(Any, doc).reference.update(
                {"isRead": True, "readAt": datetime.utcnow()}
            )
            updated += 1
        return updated

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
        """Read mobile and portal clinical records for a patient."""
        if not self.db:
            return {
                "mood_checkins": [],
                "journals": [],
                "clinical_notes": [],
                "clinical_summaries": [],
                "appointments": [],
            }

        patient = self.get_patient(patient_id)
        firebase_uid = str((patient or {}).get("firebaseUid") or "").strip()
        identifiers = {patient_id}
        if firebase_uid:
            identifiers.add(firebase_uid)

        def select_fields(
            rows: List[Dict[str, Any]], fields: tuple[str, ...]
        ) -> List[Dict[str, Any]]:
            return [
                {field: row[field] for field in fields if row.get(field) is not None}
                for row in rows[:limit]
            ]

        mood_checkins = (
            self.get_mobile_mood_checkins(firebase_uid, limit)
            if firebase_uid
            else []
        )
        journals = (
            self.get_mobile_journal_entries(firebase_uid, limit)
            if firebase_uid
            else []
        )
        clinical_notes = self.get_notes_for_patient(patient_id)[:limit]
        appointments = self.get_appointments_for_patient(patient_id)[:limit]

        summaries_by_id: Dict[str, Dict[str, Any]] = {}
        for identifier in identifiers:
            for field in ("patientID", "firebasePatientId"):
                docs = self.db.collection("clincal_summaries").where(
                    field, "==", identifier
                ).stream()
                for doc in docs:
                    data = cast(Any, doc).to_dict()
                    if isinstance(data, dict):
                        summaries_by_id[str(cast(Any, doc).id)] = data
        clinical_summaries = self._sort_by_datetime_field(
            list(summaries_by_id.values()), "timestamp", reverse=True
        )[:limit]

        mood_fields = (
            "timestamp",
            "moodScale",
            "moods",
            "displayMood",
            "emotions",
            "factors",
            "note",
            "source",
        )
        journal_fields = ("timestamp", "prompt", "entry")
        note_fields = ("createdAt", "content", "tags", "appointmentId")
        summary_fields = ("timestamp", "generatedNotes", "reviewedAndSigned")
        appointment_fields = (
            "scheduledAt",
            "type",
            "status",
            "duration",
            "notes",
            "sessionSummary",
            "actionItems",
            "moodBefore",
            "moodAfter",
        )

        return {
            "mood_checkins": select_fields(mood_checkins, mood_fields),
            "journals": select_fields(journals, journal_fields),
            "clinical_notes": select_fields(clinical_notes, note_fields),
            "clinical_summaries": select_fields(
                clinical_summaries, summary_fields
            ),
            "appointments": select_fields(appointments, appointment_fields),
        }

    def link_patient_firebase_uid(
        self,
        patient_id: str,
        firebase_uid: str,
        therapist_uid: str,
        previous_firebase_uid: Optional[str] = None,
    ) -> bool:
        """Store the patient's Firebase Auth UID on their portal `patients` document.

        This is the bridge between the mobile app user and the portal patient
        record. Once set, the portal can query mobile-side collections by UID.
        """
        if not self.db:
            return False
        batch = self.db.batch()
        patient_ref = self.db.collection("patients").document(patient_id)
        mobile_ref = self.db.collection("users").document(firebase_uid)
        batch.update(
            patient_ref,
            {"firebaseUid": firebase_uid, "updatedAt": datetime.utcnow()},
        )
        batch.set(mobile_ref, {"therapistUid": therapist_uid}, merge=True)

        old_uid = str(previous_firebase_uid or "").strip()
        if old_uid and old_uid != firebase_uid:
            old_ref = self.db.collection("users").document(old_uid)
            old_snapshot = old_ref.get()
            old_data = old_snapshot.to_dict() if old_snapshot.exists else {}
            if (old_data or {}).get("therapistUid") == therapist_uid:
                batch.set(old_ref, {"therapistUid": None}, merge=True)

        batch.commit()
        return True

    def unlink_patient_firebase_uid(
        self, patient_id: str, firebase_uid: str, therapist_uid: str
    ) -> bool:
        """Remove the Firebase UID link from a patient's portal document."""
        if not self.db:
            return False
        batch = self.db.batch()
        patient_ref = self.db.collection("patients").document(patient_id)
        batch.update(
            patient_ref,
            {"firebaseUid": None, "updatedAt": datetime.utcnow()},
        )

        if firebase_uid:
            mobile_ref = self.db.collection("users").document(firebase_uid)
            mobile_snapshot = mobile_ref.get()
            mobile_data = mobile_snapshot.to_dict() if mobile_snapshot.exists else {}
            if (mobile_data or {}).get("therapistUid") == therapist_uid:
                batch.set(mobile_ref, {"therapistUid": None}, merge=True)

        batch.commit()
        return True
