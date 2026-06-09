"""
Google Gemini AI client wrapper
Provides methods for various AI tasks:
- Audio transcription and analysis
- Text summarization
- Session note generation
- Risk assessment
- Mood pattern analysis
"""

import google.generativeai as genai
from typing import Optional
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class GeminiClient:
    """Client for interacting with Google Gemini API"""

    def __init__(self):
        """Initialize Gemini client with API key"""
        if not settings.gemini_api_key:
            logger.warning(
                "GEMINI_API_KEY not set. AI features will be disabled."
            )
            self.enabled = False
            return

        genai.configure(api_key=settings.gemini_api_key)
        self.enabled = True
        self.model = "gemini-1.5-flash"  # Free tier model

    def summarize_text(self, text: str, max_length: int = 500) -> Optional[str]:
        """Summarize session notes or transcriptions"""
        if not self.enabled:
            logger.warning("Gemini not enabled. Returning original text.")
            return text

        try:
            model = genai.GenerativeModel(self.model)
            prompt = f"""Please provide a concise summary of the following therapy session notes in {max_length} words or less:

{text}

Focus on key points, breakthroughs, and action items."""

            response = model.generate_content(prompt)
            return response.text
        except Exception as err:
            logger.error(f"Summarization failed: {str(err)}")
            return None

    def analyze_mood(self, mood_description: str) -> Optional[dict]:
        """Analyze mood entry for patterns and concerns"""
        if not self.enabled:
            return None

        try:
            model = genai.GenerativeModel(self.model)
            prompt = f"""Analyze this mood entry for mental health patterns. Provide:
1. Overall mood assessment
2. Key concerns or red flags
3. Suggested focus areas for therapy
4. Risk level (low, medium, high, critical)

Mood entry: {mood_description}

Respond in JSON format with keys: assessment, concerns, focus_areas, risk_level"""

            response = model.generate_content(prompt)
            return {"analysis": response.text, "status": "completed"}
        except Exception as err:
            logger.error(f"Mood analysis failed: {str(err)}")
            return None

    def generate_session_notes(
        self,
        transcript: str,
        patient_name: str,
        session_date: str,
    ) -> Optional[str]:
        """Generate clinical notes from session transcript"""
        if not self.enabled:
            return None

        try:
            model = genai.GenerativeModel(self.model)
            prompt = f"""As a clinical documentation assistant, generate professional therapy session notes from this transcript.

Patient: {patient_name}
Date: {session_date}

Transcript:
{transcript}

Generate notes including:
1. Chief complaint/presenting issue
2. Key observations
3. Interventions used
4. Patient response
5. Plan for next session
6. Any immediate safety concerns

Format as professional clinical documentation."""

            response = model.generate_content(prompt)
            return response.text
        except Exception as err:
            logger.error(f"Session note generation failed: {str(err)}")
            return None

    def assess_risk_level(self, context: str) -> Optional[dict]:
        """Assess risk level based on session content or mood entries"""
        if not self.enabled:
            return None

        try:
            model = genai.GenerativeModel(self.model)
            prompt = f"""Assess the risk level in this mental health context:

{context}

Provide assessment in JSON format with:
- risk_level: "low" | "medium" | "high" | "critical"
- justification: brief explanation
- recommended_actions: list of recommended actions
- immediate_safety_concerns: boolean

IMPORTANT: This is for clinical assistance only, not a replacement for professional judgment."""

            response = model.generate_content(prompt)
            return {"assessment": response.text, "status": "completed"}
        except Exception as err:
            logger.error(f"Risk assessment failed: {str(err)}")
            return None

    def extract_action_items(self, session_content: str) -> Optional[list]:
        """Extract action items from session notes or transcripts"""
        if not self.enabled:
            return None

        try:
            model = genai.GenerativeModel(self.model)
            prompt = f"""Extract action items from this therapy session content:

{session_content}

Return as a JSON array of objects with:
- title: action item
- for_patient: true/false (is it for the patient or therapist?)
- due_date: suggested timeframe

Be concise and focus on concrete action items."""

            response = model.generate_content(prompt)
            return {"action_items": response.text, "status": "completed"}
        except Exception as err:
            logger.error(f"Action item extraction failed: {str(err)}")
            return None

    def prepare_progress_report(
        self,
        patient_name: str,
        session_count: int,
        key_sessions: list,
    ) -> Optional[str]:
        """Generate progress report from multiple sessions"""
        if not self.enabled:
            return None

        try:
            model = genai.GenerativeModel(self.model)
            sessions_text = "\n".join(
                [f"- {session}" for session in key_sessions]
            )

            prompt = f"""Generate a clinical progress report for therapy:

Patient: {patient_name}
Session Count: {session_count}

Key sessions/notes:
{sessions_text}

Include:
1. Overall progress
2. Key improvements
3. Remaining focus areas
4. Treatment recommendations
5. Estimated timeline for goals

Make it professional and suitable for insurance documentation."""

            response = model.generate_content(prompt)
            return response.text
        except Exception as err:
            logger.error(f"Progress report generation failed: {str(err)}")
            return None


# Singleton instance
gemini_client = GeminiClient()
