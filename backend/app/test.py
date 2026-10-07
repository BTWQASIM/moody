"""Focused smoke tests for the provider-agnostic AI client."""

import unittest
from unittest.mock import patch

from app.ai import AIClient


class Response:
    def __init__(self, status_code: int):
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("provider unavailable")

    def json(self) -> dict:
        return {"choices": [{"message": {"content": "fallback response"}}]}


class AIClientTests(unittest.TestCase):
    def test_all_features_use_shared_generation(self):
        client = AIClient()
        with patch.object(client, "_generate_text", return_value="test response"):
            summary = client.summarize_text("notes")
        valid_report = """**Overall Progress**
The available records show gradual improvement across the review period.
**Key Improvements**
- The patient completed the documented coping exercise consistently.
**Remaining Focus Areas**
- Continue monitoring sleep and anxiety patterns between appointments.
**Treatment Recommendations**
- Review the recorded trends and continue the existing treatment plan.
**Goal Timeline**
- Reassess the documented goals at the next scheduled clinical review."""
        with patch.object(client, "_generate_text", return_value=valid_report):
            report = client.prepare_progress_report("Patient", 1, ["session"])
        with patch.object(
            client,
            "_generate_text",
            return_value=(
                '[{"title":"Practise breathing","forPatient":true,'
                '"dueDate":"Before next session"}]'
            ),
        ):
            actions = client.extract_action_items("session")

        self.assertTrue(summary)
        self.assertTrue(report)
        self.assertEqual(
            actions["action_items"][0],
            {
                "title": "Practise breathing",
                "forPatient": True,
                "dueDate": "Before next session",
            },
        )

    def test_action_items_accept_json_code_fence(self):
        parsed = AIClient._parse_action_items(
            '```json\n[{"title":"Review diary","for_patient":false,'
            '"due_date":"Next appointment"}]\n```'
        )

        self.assertEqual(parsed[0]["title"], "Review diary")
        self.assertFalse(parsed[0]["forPatient"])

    def test_progress_report_repairs_incomplete_response(self):
        client = AIClient()
        valid_report = """**Overall Progress**
The limited records indicate a stable mood pattern during this period.
**Key Improvements**
- The patient completed multiple mood check-ins.
**Remaining Focus Areas**
- More journal and clinical-note data is needed for longitudinal conclusions.
**Treatment Recommendations**
- Continue structured check-ins and review results with the therapist.
**Goal Timeline**
- Reassess after additional records are collected over two weeks."""
        with patch.object(
            client,
            "_generate_text",
            side_effect=["User Safety: safe", valid_report],
        ) as generate:
            report = client.prepare_progress_report("Patient", 3, ["mood data"])

        self.assertEqual(report, valid_report)
        self.assertEqual(generate.call_count, 2)

    def test_progress_report_rejects_two_incomplete_responses(self):
        client = AIClient()
        with patch.object(
            client,
            "_generate_text",
            side_effect=["User Safety: safe", "Still incomplete"],
        ):
            report = client.prepare_progress_report("Patient", 3, ["mood data"])

        self.assertIsNone(report)

    def test_openrouter_request(self):
        client = AIClient()
        client.enabled = True
        attempts = []

        def fake_post(url, **kwargs):
            self.assertEqual(kwargs["json"]["model"], "openrouter/free")
            attempts.append(url)
            return Response(200)

        with (
            patch("app.ai.httpx.post", side_effect=fake_post),
            patch("app.ai.settings.openrouter_api_key", "openrouter-test-key"),
        ):
            self.assertEqual(client._generate_text("test"), "fallback response")

        self.assertEqual(attempts, ["https://openrouter.ai/api/v1/chat/completions"])


if __name__ == "__main__":
    unittest.main()
