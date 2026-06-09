"""
Configuration management for the application
Handles environment variables and sensitive data
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Firebase
    firebase_credentials_path: str = os.getenv(
        "FIREBASE_CREDENTIALS_PATH", "./firebase-adminsdk.json"
    )

    # Gemini AI
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")

    # Celery
    celery_broker_url: str = os.getenv(
        "CELERY_BROKER_URL", "redis://localhost:6379/0"
    )
    celery_result_backend: str = os.getenv(
        "CELERY_RESULT_BACKEND", "redis://localhost:6379/1"
    )

    # Environment
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()
