"""One-time admin bootstrap utility.

Calls backend /api/auth/bootstrap-admin with a bootstrap secret to promote the
first admin user by Firebase Auth UID or email.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

from dotenv import load_dotenv

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bootstrap the first admin user")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Backend base URL")
    parser.add_argument("--secret", default="", help="Bootstrap secret; defaults to ADMIN_BOOTSTRAP_SECRET")
    parser.add_argument("--uid", default="", help="Firebase Auth UID to promote")
    parser.add_argument("--email", default="", help="Firebase Auth email to promote")
    return parser.parse_args()


def main() -> int:
    load_dotenv(os.path.join(BACKEND_ROOT, ".env"))
    args = parse_args()

    if not args.uid and not args.email:
        print("ERROR: provide --uid or --email")
        return 1

    secret = args.secret or os.getenv("ADMIN_BOOTSTRAP_SECRET", "")
    if not secret:
        print("ERROR: bootstrap secret not provided (use --secret or ADMIN_BOOTSTRAP_SECRET)")
        return 1

    payload = {
        "uid": args.uid or None,
        "email": args.email or None,
    }

    url = f"{args.base_url.rstrip('/')}/api/auth/bootstrap-admin"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Bootstrap-Secret": secret,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            print(body)
            return 0
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8") if err.fp else ""
        print(f"HTTP {err.code}: {body}")
        return 1
    except Exception as err:
        print(f"ERROR: {err}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
