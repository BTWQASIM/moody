# Ping My Therapist — Web Portal

Next.js therapist and admin portal with a FastAPI backend. Shares the **Ping My Therapist** Firebase project (`pingmytherapist`) with the Flutter mobile app.

## What this repo includes

- **Therapist portal** — dashboard, patients, appointments, settings, availability
- **Admin portal** — therapist approval, access control, notifications
- **Backend API** — Firebase Auth verification, Firestore, file uploads, AI tasks (Celery + Redis)
- **Mobile integration** — link portal patients to mobile Firebase UIDs; view mood check-ins and journal entries; accept/decline appointment requests from the app

## Prerequisites

- **Node.js 20+** and **pnpm** (`npm install -g pnpm`)
- **Python 3.11+** (local backend)
- **Redis** (optional — required for AI background tasks)
- **Docker Desktop** (optional — Redis + backend via Compose)
- Access to the [Ping My Therapist Firebase project](https://console.firebase.google.com/project/pingmytherapist)

## Quick start

### 1. Frontend

```bash
cd web
pnpm install
cp .env.example .env.local
# Edit .env.local with your Firebase web app config from Firebase Console
pnpm dev
```

Open **http://localhost:3000**

| Route | Purpose |
|-------|---------|
| `/login` | Therapist / admin sign in |
| `/register` | Therapist registration (pending admin approval) |
| `/dashboard` | Therapist dashboard |
| `/admin/dashboard` | Admin dashboard |
| `/admin/therapists` | Approve or revoke therapist access |
| `/appointments` | Manage and accept mobile appointment requests |

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local` when using the local backend.

### 2. Backend

```bash
cd web/backend
cp .env.example .env
# Place your service account JSON at backend/firebase-adminsdk.json
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: **http://localhost:8000/health**

Copy your Firebase service account key to `backend/firebase-adminsdk.json` (see `.env.example` for `FIREBASE_CREDENTIALS_PATH`). **Never commit this file.**

### 3. Full stack (Docker + frontend)

```bash
cd web
docker compose up --build
```

In a second terminal:

```bash
cd web
pnpm dev
```

- Frontend: http://localhost:3000  
- Backend: http://localhost:8000  
- Redis: localhost:6379  

## Firebase setup

In [Firebase Console → pingmytherapist](https://console.firebase.google.com/project/pingmytherapist):

1. **Authentication → Sign-in method** — enable **Email/Password**
2. **Authentication → Authorized domains** — add `localhost` (and your production domain)
3. **Firestore** — use the same database as the mobile app
4. **Service account** — download JSON for the backend (Project Settings → Service accounts)

### First admin (one-time)

```bash
cd web/backend
# Set ADMIN_BOOTSTRAP_ENABLED=true and ADMIN_BOOTSTRAP_SECRET in .env
python scripts/bootstrap_admin.py --email admin@example.com
# Then set ADMIN_BOOTSTRAP_ENABLED=false again
```

Seed demo therapists (optional):

```bash
cd web/backend
python scripts/seed_therapists.py
```

## Therapist approval flow

1. Therapist registers at `/register` (profile, credentials, weekly availability)
2. Account is created with `verified: false` / `pending_verification`
3. Admin approves at `/admin/therapists`
4. Approved therapists can sign in and appear in the **mobile app** therapist list

## Production build

```bash
pnpm build
pnpm start
```

## Project structure

```
web/
├── app/                 # Next.js App Router (therapist + admin + auth)
├── components/          # UI components
├── lib/
│   ├── firebase.ts      # Client Firebase (Auth, Firestore, Storage)
│   ├── api.ts           # Backend API client
│   ├── hooks.ts         # React data hooks
│   └── availability.ts  # Shared therapist availability format
└── backend/
    ├── app/             # FastAPI routes and Firestore DAO
    └── scripts/         # Seed and bootstrap utilities
```

## Do not commit

These are gitignored — keep them local only:

| Path | Purpose |
|------|---------|
| `.env.local` | Frontend secrets and Firebase web config |
| `backend/.env` | Backend environment variables |
| `backend/firebase-adminsdk.json` | Firebase Admin service account |
| `backend/venv/` | Python virtual environment |
| `node_modules/`, `.next/` | Frontend build artifacts |

See `.gitignore` for the full list.

## Related repos

The **Flutter mobile app** lives in the parent `Ping My Therapist` repository (separate git repo). Patients book sessions and submit mood/journal data there; this portal reads and manages that linked data.
