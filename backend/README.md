# Ping My Therapist — Backend

FastAPI backend for the therapist/admin web portal. Verifies Firebase ID tokens, reads and writes Firestore, and serves the Next.js frontend via REST.

Firebase project: **`pingmytherapist`** (shared with the Flutter mobile app).

## Setup

```bash
cd web/backend
cp .env.example .env
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

1. Download a service account key from Firebase Console → Project Settings → Service accounts.
2. Save it as `firebase-adminsdk.json` in this folder (or set `FIREBASE_CREDENTIALS_JSON` in `.env` for hosted deploys).
3. Confirm `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET` in `.env` match your project.

Run locally:

```bash
uvicorn app.main:app --reload --port 8000
```

Health check: http://localhost:8000/health

## Docker

From the `web` directory:

```bash
docker compose up --build
```

Requires `backend/.env` and `backend/firebase-adminsdk.json` on your machine (not committed).

## Scripts

```bash
# Seed demo therapists (Auth + Firestore)
python scripts/seed_therapists.py

# One-time first admin (see .env ADMIN_BOOTSTRAP_* flags)
python scripts/bootstrap_admin.py --email admin@example.com
```

## Key API areas

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | Custom claims, profiles, admin therapist approval |
| `/api/patients` | Patient CRUD, mobile UID linking, mobile activity |
| `/api/appointments` | List, confirm, cancel (including mobile requests) |
| `/api/uploads` | Profile photos and license documents |
| `/api/ai` | AI assistant (requires Redis + Celery + `GEMINI_API_KEY`) |

## Environment variables

See `.env.example`. Required for most features:

- `FIREBASE_CREDENTIALS_PATH` or `FIREBASE_CREDENTIALS_JSON`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`

Optional:

- `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` — AI background tasks
- `GEMINI_API_KEY` — AI features
- `ADMIN_BOOTSTRAP_ENABLED` / `ADMIN_BOOTSTRAP_SECRET` — one-time admin creation

## Do not commit

- `firebase-adminsdk.json` or any `*firebase-adminsdk*.json`
- `.env`
- `venv/`, `__pycache__/`, `local-uploads/`
