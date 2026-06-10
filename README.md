# Moody Therapist Portal (Web)

Next.js therapist dashboard with a FastAPI backend. Uses the **PingMyTherapist** Firebase project (`pingmytherapist`).

## Prerequisites

- **Node.js 20+** and **pnpm** (`npm install -g pnpm`)
- **Python 3.11+** (only if running the backend locally without Docker)
- **Docker Desktop** (optional — for Redis + backend via Compose)
- Access to the [PingMyTherapist Firebase project](https://console.firebase.google.com/project/pingmytherapist)

## 1. Frontend only (UI + Firebase Auth)

From the `web` directory:

```bash
cd "/Users/saifahmed/development/Ping My Therapist/web"
pnpm install
pnpm dev
```

Open **http://localhost:3000**

Useful routes:

| URL | Purpose |
|-----|---------|
| http://localhost:3000/login | Sign in |
| http://localhost:3000/register | Therapist registration |
| http://localhost:3000/dashboard | Main dashboard (requires login) |
| http://localhost:3000/firebase-debug | Verify Firebase env + auth |

### Firebase env (frontend)

`.env.local` must point at **PingMyTherapist**. To set it up:

```bash
cp .env.example .env.local
# Fill in values from Firebase Console → Project Settings → Your apps → Web app config
```

Required variables: `NEXT_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`.

### Firebase Console checklist

In [Firebase Console → PingMyTherapist](https://console.firebase.google.com/project/pingmytherapist):

1. **Authentication → Sign-in method** — enable **Email/Password** (and Anonymous if you use the debug page test)
2. **Authentication → Settings → Authorized domains** — add `localhost`
3. **Firestore** — create database if not already (same rules as mobile app)

## 2. Full stack (frontend + backend + Redis)

### Backend Firebase Admin (server-side)

The API verifies Firebase ID tokens and writes to Firestore. You need a service account key:

1. Firebase Console → **Project Settings → Service accounts**
2. **Generate new private key** → save as `web/backend/firebase-adminsdk.json`
3. Ensure `backend/.env` contains:

```env
FIREBASE_CREDENTIALS_PATH=./firebase-adminsdk.json
FIREBASE_STORAGE_BUCKET=pingmytherapist.firebasestorage.app
```

`firebase-adminsdk.json` must **not** be committed (add to `.gitignore` if needed).

### Option A — Docker (recommended)

```bash
cd "/Users/saifahmed/development/Ping My Therapist/web"
docker compose up --build
```

Then in a second terminal:

```bash
cd "/Users/saifahmed/development/Ping My Therapist/web"
pnpm dev
```

- Frontend: http://localhost:3000  
- Backend health: http://localhost:8000/health  
- Redis: localhost:6379  

### Option B — Local Python backend

```bash
# Terminal 1 — Redis
redis-server

# Terminal 2 — Backend
cd "/Users/saifahmed/development/Ping My Therapist/web/backend"
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt   # if present
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd "/Users/saifahmed/development/Ping My Therapist/web"
pnpm dev
```

## Production build

```bash
pnpm build
pnpm start
```

Runs on http://localhost:3000 by default.

## Project structure

```
web/
├── app/              # Next.js App Router pages
├── components/       # UI components (shadcn)
├── lib/
│   ├── firebase.ts   # Client Firebase init (Auth, Firestore, Storage)
│   ├── api.ts        # Backend API client (sends Firebase ID tokens)
│   └── hooks.ts      # React hooks for API calls
└── backend/          # FastAPI + Celery + Firebase Admin
```
