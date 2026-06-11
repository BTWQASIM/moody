import os
import json
import firebase_admin
from firebase_admin import credentials, auth, firestore, storage
from dotenv import load_dotenv

# Resolve paths from the backend root so uvicorn works regardless of cwd.
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BACKEND_ROOT, ".env"))


def _resolve_path(path: str) -> str:
    if os.path.isabs(path):
        return path
    return os.path.normpath(os.path.join(BACKEND_ROOT, path.lstrip("./")))


def _build_app_options() -> dict:
    options = {
        "storageBucket": os.getenv(
            "FIREBASE_STORAGE_BUCKET",
            "pingmytherapist.appspot.com",
        )
    }
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    if project_id:
        options["projectId"] = project_id
    return options

def get_firebase_app():
    if not firebase_admin._apps:
        cred_path_env = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-adminsdk.json")
        cred_path = _resolve_path(cred_path_env)

        if os.path.exists(cred_path):
            try:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred, _build_app_options())
                print(f"Firebase Admin initialized using {cred_path}")
            except Exception as err:
                print(f"WARNING: Invalid Firebase credentials file at {cred_path}: {err}")
        else:
            creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if creds_json:
                try:
                    cred_dict = json.loads(creds_json)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred, _build_app_options())
                    print("Firebase Admin initialized from FIREBASE_CREDENTIALS_JSON")
                except Exception as err:
                    print(f"WARNING: Invalid FIREBASE_CREDENTIALS_JSON: {err}")
            else:
                print("WARNING: No Firebase Admin credentials found. Backend running without Firebase.")
                print(f"  Expected file: {cred_path}")
                print("  Download from Firebase Console → Project Settings → Service accounts → Generate new private key")

    return firebase_admin.get_app() if firebase_admin._apps else None

def get_auth_client():
    if get_firebase_app():
        return auth
    return None

def get_db_client():
    if get_firebase_app():
        return firestore.client()
    return None

def get_storage_client():
    if get_firebase_app():
        return storage.bucket()
    return None
