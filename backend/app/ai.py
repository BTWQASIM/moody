"""Provider-agnostic AI client backed by OpenRouter."""

import json
import logging
import re
from typing import Any, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class AIClient:
    """Generate clinical-assistance text through OpenRouter."""

    _base_url = "https://openrouter.ai/api/v1/chat/completions"
    _model = "openrouter/free"
    _progress_sections = (
        "overall progress",
        "key improvements",
        "remaining focus areas",
        "treatment recommendations",
        "goal timeline",
    )

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
        prompt = f"""Summarize the following therapy session notes in {max_length} words or less.

Return clean Markdown using exactly these sections when the source supports them:
**Presenting Concerns**
**Key Discussion and Interventions**
**Progress and Response**
**Risk and Safety**
**Plan and Follow-up**

Use concise bullet points beneath each section. Do not add a preamble, code fence,
diagnosis that is not in the notes, or information not supported by the source.

Session notes:

{text}
"""
        return self._generate_text(prompt)

    @staticmethod
    def _parse_action_items(value: str) -> list[dict[str, Any]]:
        """Normalize a model JSON response into display-safe action items."""
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", value.strip())
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if not match:
            raise ValueError("AI response did not contain an action-item array")
        payload = json.loads(match.group(0))
        if not isinstance(payload, list):
            raise ValueError("AI action-item response must be an array")

        items: list[dict[str, Any]] = []
        for raw in payload[:20]:
            if not isinstance(raw, dict):
                continue
            title = str(raw.get("title") or "").strip()
            if not title:
                continue
            items.append(
                {
                    "title": title,
                    "forPatient": bool(
                        raw.get("forPatient", raw.get("for_patient", True))
                    ),
                    "dueDate": str(
                        raw.get("dueDate") or raw.get("due_date") or "Not specified"
                    ).strip(),
                }
            )
        if not items:
            raise ValueError("AI response contained no valid action items")
        return items

    def extract_action_items(
        self,
        session_content: str,
    ) -> Optional[dict[str, Any]]:
        """Extract action items from session notes or transcripts."""
        prompt = f"""Extract concrete action items from this therapy session content.

Return only a valid JSON array. Do not use Markdown or code fences. Each item must use:
{{"title": "clear action", "forPatient": true, "dueDate": "specific timeframe"}}

Use forPatient=false for therapist responsibilities. Do not invent tasks that are
not reasonably supported by the session content.

Session content:

{session_content}
"""
        response = self._generate_text(prompt)
        if not response:
            return None
        try:
            return {
                "action_items": self._parse_action_items(response),
                "status": "completed",
            }
        except (json.JSONDecodeError, ValueError, TypeError) as err:
            logger.error("Invalid action-item response: %s", err)
            return None

    def prepare_progress_report(
        self,
        patient_name: str,
        session_count: int,
        key_sessions: list,
    ) -> Optional[str]:
        """Generate a progress report from multiple sessions."""
        sessions_text = "\n".join(f"- {session}" for session in key_sessions)
        prompt = f"""Generate a detailed but concise clinical progress report from the supplied records.

Return clean Markdown using exactly these sections:
**Overall Progress**
**Key Improvements**
**Remaining Focus Areas**
**Treatment Recommendations**
**Goal Timeline**

Use short paragraphs or bullet points. Do not add a preamble, code fence, unsupported
diagnosis, or facts that are absent from the records.
If the records are sparse, still complete every section and explicitly describe the
data limitation instead of returning a safety classification or one-line response.

Patient: {patient_name}
Session Count: {session_count}

Available clinical records:
{sessions_text}
"""
        report = self._generate_text(prompt)
        if self._is_valid_progress_report(report):
            return report

        repair_prompt = f"""The previous response was incomplete:
{report or "No response"}

Rewrite the report using all five required Markdown headings exactly as specified.
Each section must contain at least one evidence-based sentence or bullet. State when
the available data is insufficient. Do not return only a safety label.

Original request and records:
{prompt}
"""
        repaired = self._generate_text(repair_prompt)
        return repaired if self._is_valid_progress_report(repaired) else None

    @classmethod
    def _is_valid_progress_report(cls, report: Optional[str]) -> bool:
        if not report or len(report.strip()) < 200:
            return False
        normalized = report.lower()
        return all(section in normalized for section in cls._progress_sections)


# Backward-compatible alias retained for existing Celery task callers.
gemini_client = AIClient()
