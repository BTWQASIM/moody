"""Provider-agnostic AI client backed by OpenRouter."""

import logging
from typing import Any, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class AIClient:
    """Generate clinical-assistance text through OpenRouter."""

    _base_url = "https://openrouter.ai/api/v1/chat/completions"
    _model = "openrouter/free"

    def __init__(self) -> None:
        self.enabled = bool(settings.openrouter_api_key)
        if not self.enabled:
            logger.warning(
                "OPENROUTER_API_KEY is not configured. AI features are disabled."
            )

    def _generate_text(self, prompt: str) -> Optional[str]:
        """Generate text through OpenRouter's OpenAI-compatible endpoint."""
        if not self.enabled:
            return None

        try:
            response = httpx.post(
                self._base_url,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost",
                    "X-Title": "Moody Clinical Assistant",
                },
                json={
                    "model": self._model,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=60.0,
            )
            response.raise_for_status()
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("OpenRouter returned an empty response")

            logger.info("AI request succeeded with openrouter/%s", self._model)
            return content
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as err:
            logger.exception("OpenRouter request failed: %s", err)
            return None

    def summarize_text(
        self,
        text: str,
        max_length: int = 500,
    ) -> Optional[str]:
        """Summarize session notes or transcriptions."""
        prompt = f"""Please provide a concise summary of the following therapy session
notes in {max_length} words or less:

{text}

Focus on key points, breakthroughs, and action items."""
        return self._generate_text(prompt)

    def extract_action_items(
        self,
        session_content: str,
    ) -> Optional[dict[str, Any]]:
        """Extract action items from session notes or transcripts."""
        prompt = f"""Extract action items from this therapy session content:

{session_content}

Return as a JSON array of objects with:
- title: action item
- for_patient: true/false (is it for the patient or therapist?)
- due_date: suggested timeframe

Be concise and focus on concrete action items."""
        action_items = self._generate_text(prompt)
        return (
            {"action_items": action_items, "status": "completed"}
            if action_items
            else None
        )

    def prepare_progress_report(
        self,
        patient_name: str,
        session_count: int,
        key_sessions: list,
    ) -> Optional[str]:
        """Generate a progress report from multiple sessions."""
        sessions_text = "\n".join(f"- {session}" for session in key_sessions)
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
        return self._generate_text(prompt)


# Backward-compatible alias retained for existing Celery task callers.
gemini_client = AIClient()
