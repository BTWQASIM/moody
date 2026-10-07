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

Start Redis and the Celery worker for AI background tasks:

```bash
redis-server --bind 127.0.0.1 --port 6379
celery -A app.tasks:celery_app worker --loglevel=INFO --pool=solo
```

The worker uses `CELERY_BROKER_URL` on Redis database 0 and
`CELERY_RESULT_BACKEND` on Redis database 1. Redis must be running before
submitting AI tasks.

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

### Brock portal demo data

`seed_portal_demo.py` adds a deterministic, therapist-scoped demonstration dataset
for the existing `brocklesnar@moodie.com` account. It creates dedicated demo
patient Firebase Auth accounts so seeded appointments are visible in the mobile
app. It never changes the therapist's password or claims. Dry-run is the default:

```bash
# Verify the therapist and preview collection counts; performs no writes
python scripts/seed_portal_demo.py

# Upsert the tagged demo records after reviewing the dry run
python scripts/seed_portal_demo.py --apply

# Optionally choose the shared demo-patient login password
python scripts/seed_portal_demo.py --apply --patient-password 'StrongDemoPassword!'

# Remove only records that still carry this seed's tag
python scripts/seed_portal_demo.py --cleanup --apply
```

The apply command prints the demo patient emails and shared password. The
deterministic records can be refreshed safely by running `--apply` again.
Existing untagged portal data is left untouched. Cleanup preserves the tagged
demo login profiles so they can be reused safely.

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
- `PATIENT_DATA_ENCRYPTION_KEY` — base64-encoded 32-byte AES key used to encrypt
  `patients.clinicalNotes` before Firestore writes. Generate one with
  `openssl rand -base64 32`. Keep the same key across deploys and backups;
  losing it makes encrypted notes unrecoverable.

Patient profile notes use versioned AES-256-GCM encryption when this key is
configured. The API decrypts them transparently for authorized therapists, so
the frontend contract does not change. Existing plaintext notes remain readable
and are encrypted the next time they are edited.

## Do not commit

- `firebase-adminsdk.json` or any `*firebase-adminsdk*.json`
- `.env`
- `venv/`, `__pycache__/`, `local-uploads/`
