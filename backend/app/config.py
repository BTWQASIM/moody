"""
Configuration management for the application
Handles environment variables and sensitive data
"""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Firebase
    firebase_credentials_path: str = os.getenv(
        "FIREBASE_CREDENTIALS_PATH", "./firebase-adminsdk.json"
    )
    firebase_project_id: str = os.getenv("FIREBASE_PROJECT_ID", "")
    firebase_storage_bucket: str = os.getenv(
        "FIREBASE_STORAGE_BUCKET", "pingmytherapist.firebasestorage.app"
    )

    # OpenRouter AI
    openrouter_api_key: str = ""

    # Celery
    celery_broker_url: str = os.getenv(
        "CELERY_BROKER_URL", "redis://localhost:6379/0"
    )
    celery_result_backend: str = os.getenv(
        "CELERY_RESULT_BACKEND", "redis://localhost:6379/1"
    )

    # Environment
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


# Global settings instance
settings = Settings()
