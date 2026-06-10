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

Next steps: design database schema, add auth, and implement API routes.
