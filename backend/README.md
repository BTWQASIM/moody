# Moody Therapist Portal — Backend

This folder contains the FastAPI backend scaffold for the Moody Therapist Portal.

Quick start (using Docker Compose):

```bash
# from project root
docker compose up --build
```

Then open http://localhost:8000/health

Firebase setup:

1. Copy `backend/.env.example` to `backend/.env`.
2. Set one of:
	- `FIREBASE_CREDENTIALS_PATH=./firebase-adminsdk.json` (recommended for local)
	- `FIREBASE_CREDENTIALS_JSON={...}` (for hosted environments)
3. Confirm `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET` match your Firebase project.

Seed Firestore with starter data:

```bash
cd backend
python scripts/seed_firebase.py
```

Bootstrap first admin (one-time):

1. In `backend/.env`, set:

```env
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_SECRET=<strong-random-secret>
```

2. Run one of:

```bash
cd backend
python scripts/bootstrap_admin.py --email admin@example.com
# or
python scripts/bootstrap_admin.py --uid <firebase-auth-uid>
```

3. After success, disable bootstrap again:

```env
ADMIN_BOOTSTRAP_ENABLED=false
```

The endpoint can only be used once and is automatically locked after first success.

Next steps: design database schema, add auth, and implement API routes.
