import firebase_admin
from firebase_admin import credentials, auth, firestore, storage
import os
import json

def get_firebase_app():
    if not firebase_admin._apps:
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
        
        # In dev, the user might not have generated the JSON yet
        # We need a fallback if the file doesn't exist so the FastAPI server won't instantly crash
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {
                'storageBucket': os.getenv(
                    'FIREBASE_STORAGE_BUCKET',
                    'pingmytherapist.firebasestorage.app',
                )
            })
        else:
            # Check if we have env vars containing the JSON directly (good for deployment)
            creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if creds_json:
                cred_dict = json.loads(creds_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred, {
                    'storageBucket': os.getenv(
                        'FIREBASE_STORAGE_BUCKET',
                        'pingmytherapist.firebasestorage.app',
                    )
                })
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
