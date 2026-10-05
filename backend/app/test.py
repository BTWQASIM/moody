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
            results = [
                client.summarize_text("notes"),
                client.extract_action_items("session"),
                client.prepare_progress_report("Patient", 1, ["session"]),
            ]

        self.assertTrue(all(results))

    def test_openrouter_request(self):
        client = AIClient()
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
