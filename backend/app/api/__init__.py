"""
API routers for the Moody Therapist Portal backend
"""

from . import health, auth, patients, appointments, services, mood, notes, alerts, notifications, uploads, ai

__all__ = ["health", "auth", "patients", "appointments", "services", "mood", "notes", "alerts", "notifications", "uploads", "ai"]
