import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.firebase import get_firebase_app
from app.api import health, auth, patients, appointments, services, mood, notes, alerts, messages, notifications, uploads, ai

app = FastAPI(title="Moody Therapist Portal API")

# Setup CORS — set CORS_ORIGINS env var in production (comma-separated URLs)
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Firebase Admin
get_firebase_app()

uploads_dir = os.path.abspath(os.getenv("LOCAL_UPLOADS_DIR", "./uploads"))
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

app.include_router(health.router, tags=["Health"])
app.include_router(auth.router, tags=["Auth"])
app.include_router(patients.router, tags=["Patients"])
app.include_router(appointments.router, tags=["Appointments"])
app.include_router(services.router, tags=["Services"])
app.include_router(mood.router, tags=["Mood"])
app.include_router(notes.router, tags=["Clinical Notes"])
app.include_router(alerts.router, tags=["Risk Alerts"])
app.include_router(messages.router, tags=["Messages"])
app.include_router(notifications.router, tags=["Notifications"])
app.include_router(uploads.router, tags=["File Uploads"])
app.include_router(ai.router, tags=["AI Operations"])


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
