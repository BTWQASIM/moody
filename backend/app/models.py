"""
Data models for Firestore collections in the Moody Therapist Portal
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field


# ============================================================================
# Enum definitions for status and role fields
# ============================================================================

class TherapistStatus(str, Enum):
    PENDING_VERIFICATION = "pending_verification"
    VERIFIED = "verified"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


class UserRole(str, Enum):
    ADMIN = "admin"
    THERAPIST = "therapist"


class PatientStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DISCHARGED = "discharged"
    PENDING_INTAKE = "pending_intake"


class AppointmentStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"
    NO_SHOW = "no_show"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MoodEntryStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    REVIEWED = "reviewed"
    FLAGGED = "flagged"


# ============================================================================
# Therapist Models
# ============================================================================

class TherapistProfile(BaseModel):
    uid: str
    role: UserRole = UserRole.THERAPIST
    name: str
    email: str
    phone: str
    qualifications: str
    licenseNumber: str
    yearsOfExperience: int
    bio: str
    specializations: List[str] = Field(default_factory=list)
    status: TherapistStatus = TherapistStatus.PENDING_VERIFICATION
    verified: bool = False
    verifiedAt: Optional[datetime] = None
    profilePhoto: Optional[str] = None  # URL to Firebase Storage
    documentUrls: List[str] = Field(default_factory=list)  # License, certifications
    availability: List[dict] = Field(default_factory=list)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "uid": "user-123",
                "name": "Dr. Jane Doe",
                "email": "jane@clinic.com",
                "phone": "+1 (555) 123-4567",
                "qualifications": "Ph.D. Clinical Psychology",
                "licenseNumber": "PSY-00001-CA",
                "yearsOfExperience": 8,
                "bio": "Specializing in anxiety and trauma",
                "specializations": ["Anxiety", "PTSD & Trauma"],
                "status": "verified",
            }
        }


# ============================================================================
# Patient Models
# ============================================================================

class PatientContactInfo(BaseModel):
    emergencyName: str
    emergencyPhone: str
    emergencyRelation: str


class PatientProfile(BaseModel):
    id: str  # Firestore auto-generated ID or custom
    therapistUid: str  # Reference to therapist
    # Firebase Auth UID of the patient's mobile app account (set when linked)
    firebaseUid: Optional[str] = None
    firstName: str
    lastName: str
    dateOfBirth: str  # ISO 8601 format
    email: str
    phone: str
    address: str
    city: str
    state: str
    zipCode: str
    emergencyContact: PatientContactInfo
    insuranceProvider: Optional[str] = None
    insuranceMemberId: Optional[str] = None
    status: PatientStatus = PatientStatus.PENDING_INTAKE
    intakeDate: Optional[datetime] = None
    lastSessionDate: Optional[datetime] = None
    clinicalNotes: str = ""
    medicalHistory: str = ""
    currentMedications: str = ""
    sessionCount: int = 0
    riskLevel: RiskLevel = RiskLevel.LOW
    profilePhoto: Optional[str] = None  # URL to Firebase Storage
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Appointment Models
# ============================================================================

class AppointmentDetails(BaseModel):
    therapistUid: str
    patientId: str
    scheduledAt: datetime
    duration: int  # Minutes
    type: str  # e.g., "individual", "couples", "group"
    status: AppointmentStatus = AppointmentStatus.PENDING
    notes: Optional[str] = None
    sessionNotes: Optional[str] = None
    moodBefore: Optional[int] = None  # 1-10 scale
    moodAfter: Optional[int] = None  # 1-10 scale
    completedAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Service Models (Services offered by therapist)
# ============================================================================

class ServiceOffering(BaseModel):
    id: str  # Firestore auto-generated
    therapistUid: str
    name: str
    description: str
    duration: int  # Minutes
    price: float  # USD
    isActive: bool = True
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Mood Entry Models (Patient self-reported mood data)
# ============================================================================

class MoodEntry(BaseModel):
    id: str  # Firestore auto-generated
    patientId: str
    therapistUid: str  # Therapist assigned to patient
    moodScore: int  # 1-10 scale
    emotionalState: str  # e.g., "anxious", "depressed", "calm", etc.
    triggers: List[str] = Field(default_factory=list)
    symptoms: List[str] = Field(default_factory=list)
    notes: str
    status: MoodEntryStatus = MoodEntryStatus.PENDING_REVIEW
    riskLevel: RiskLevel = RiskLevel.LOW
    recordedAt: datetime
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Clinical Note Models
# ============================================================================

class ClinicalNote(BaseModel):
    id: str  # Firestore auto-generated
    patientId: str
    therapistUid: str
    appointmentId: Optional[str] = None
    content: str
    confidential: bool = True
    tags: List[str] = Field(default_factory=list)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Risk Alert Models
# ============================================================================

class RiskAlert(BaseModel):
    id: str  # Firestore auto-generated
    patientId: str
    therapistUid: str
    title: str
    description: str
    riskLevel: RiskLevel
    source: str  # e.g., "mood_entry", "clinical_note", "ai_analysis"
    isAcknowledged: bool = False
    acknowledgedAt: Optional[datetime] = None
    acknowledgedBy: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Message Models (Therapist-Patient messaging)
# ============================================================================

class Message(BaseModel):
    id: str  # Firestore auto-generated
    threadId: str  # Conversation thread ID
    senderId: str  # Therapist UID or Patient ID
    senderType: str  # "therapist" or "patient"
    recipientId: str
    content: str
    attachments: List[str] = Field(default_factory=list)  # URLs
    isRead: bool = False
    readAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)


class MessageThread(BaseModel):
    id: str  # Firestore auto-generated
    therapistUid: str
    patientId: str
    subject: str
    lastMessage: str
    lastMessageAt: datetime
    isActive: bool = True
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Notification Models
# ============================================================================

class Notification(BaseModel):
    id: str  # Firestore auto-generated
    userId: str  # Therapist UID
    type: str  # e.g., "appointment_reminder", "risk_alert", "message", "new_patient"
    title: str
    message: str
    relatedId: Optional[str] = None  # Reference to related entity (patient, appointment, etc)
    isRead: bool = False
    readAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Audit Log Models (For compliance and security tracking)
# ============================================================================

class AuditLog(BaseModel):
    id: str  # Firestore auto-generated
    userId: str  # UID of person who performed action
    action: str  # e.g., "create_note", "view_patient_file", "export_data"
    entityType: str  # What was affected (patient, note, appointment, etc)
    entityId: str  # ID of the entity
    details: dict = Field(default_factory=dict)
    ipAddress: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Mobile App Data Models (written directly by the Flutter patient app)
# These map to the mobile-side Firestore collections: mood_checkins,
# journal_entries.  They are read-only from the portal's perspective.
# ============================================================================

class MobileMoodCheckin(BaseModel):
    """Maps to the `mood_checkins` collection written by the Flutter app."""
    id: str  # Firestore auto-generated document ID
    userId: str  # Patient's Firebase Auth UID
    therapistUid: Optional[str] = None  # Set once patient is linked
    moods: List[str] = Field(default_factory=list)  # e.g. ["Light & Clear"]
    timestamp: Optional[datetime] = None


class MobileJournalEntry(BaseModel):
    """Maps to the `journal_entries` collection written by the Flutter app."""
    id: str  # Firestore auto-generated document ID
    userId: str  # Patient's Firebase Auth UID
    therapistUid: Optional[str] = None  # Set once patient is linked
    entry: str
    prompt: Optional[str] = None  # The journaling prompt used, if any
    timestamp: Optional[datetime] = None
