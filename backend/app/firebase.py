import os
import json
import firebase_admin
from firebase_admin import credentials, auth, firestore, storage
from dotenv import load_dotenv

load_dotenv()


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
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")

        # In dev, the user might not have generated the JSON yet
        # We need a fallback if the file doesn't exist so the FastAPI server won't instantly crash
        if cred_path and os.path.exists(cred_path):
            try:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred, _build_app_options())
            except Exception as err:
                print(f"WARNING: Invalid Firebase credentials file at {cred_path}: {err}")
        else:
            # Check if we have env vars containing the JSON directly (good for deployment)
            creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if creds_json:
                try:
                    cred_dict = json.loads(creds_json)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred, _build_app_options())
                except Exception as err:
                    print(f"WARNING: Invalid FIREBASE_CREDENTIALS_JSON: {err}")
            else:
                print("WARNING: No Firebase Admin credentials found. Backend running without Firebase.")

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
