# File Upload System Documentation

## Overview

The Moody Therapist Portal implements a complete file upload system using Firebase Cloud Storage with signed URLs for secure access.

## Backend Architecture

### Upload Endpoints

All endpoints in `backend/app/api/uploads.py` require Firebase authentication via `Authorization: Bearer {token}` header.

#### 1. Profile Photo Upload
```
POST /api/uploads/profile-photo
```
- Stores therapist/patient profile photos
- Max size: 5MB
- Allowed formats: image/* (JPEG, PNG, WebP, etc.)
- Returns signed URL valid for 1 hour

#### 2. Document Upload
```
POST /api/uploads/document
Parameters:
  - file: File to upload
  - documentType: "license" | "certification" | "insurance" | "consent_form" | "other"
```
- Stores professional documents
- Max size: 10MB
- Allowed formats: PDF, DOC, DOCX, PNG, JPG, etc.
- Organized by document type in storage

#### 3. Audio Recording Upload
```
POST /api/uploads/audio-recording
Parameters:
  - file: Audio file
  - patientId: Patient ID (must belong to authenticated therapist)
  - sessionDate: Date of session (YYYY-MM-DD format)
```
- Stores session recordings
- Max size: 100MB
- Allowed formats: audio/* (M4A, MP3, WAV, etc.)
- Organized by therapist/patient/session date

#### 4. Session Export Upload
```
POST /api/uploads/session-export
Parameters:
  - file: Exported file (PDF, transcript, etc.)
  - appointmentId: Appointment ID (must belong to authenticated therapist)
```
- Stores exported sessions or transcripts
- Max size: 50MB
- Automatically links to appointment record
- Sets `appointment.sessionNotes` to signed URL

#### 5. File Deletion
```
DELETE /api/uploads/{filePath}
```
- Deletes uploaded file
- Authorization check: file path must contain user's UID

## Storage Structure

Files are organized hierarchically in Cloud Storage:

```
moody-therapist-storage/
├── profile-photos/
│   └── {userId}/{timestamp}.{ext}
├── documents/
│   └── {userId}/{documentType}/{timestamp}.{ext}
├── recordings/
│   └── {therapistUid}/{patientId}/{sessionDate}/{timestamp}.{ext}
└── exports/
    └── {therapistUid}/{appointmentId}/{timestamp}.{ext}
```

## Frontend Usage

### Using Upload Hooks

#### Profile Photo Upload
```typescript
import { useUploadProfilePhoto } from "@/lib/hooks";

function MyComponent() {
  const { execute, loading, error, data } = useUploadProfilePhoto();

  const handleUpload = async (file: File) => {
    try {
      const result = await execute(file);
      console.log("Uploaded to:", result.fileUrl);
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      {loading && <p>Uploading...</p>}
      {error && <p>Error: {error.message}</p>}
    </div>
  );
}
```

#### Document Upload
```typescript
import { useUploadDocument } from "@/lib/hooks";

function MyComponent() {
  const { execute, loading } = useUploadDocument();

  const handleUpload = async (file: File, type: string) => {
    await execute({ file, documentType: type });
  };

  return (
    // ...
  );
}
```

#### Audio Recording Upload
```typescript
import { useUploadAudioRecording } from "@/lib/hooks";

function MyComponent() {
  const { execute, loading } = useUploadAudioRecording();

  const handleUpload = async (file: File, patientId: string) => {
    await execute({
      file,
      patientId,
      sessionDate: new Date().toISOString().split('T')[0],
    });
  };

  return (
    // ...
  );
}
```

#### Session Export Upload
```typescript
import { useUploadSessionExport } from "@/lib/hooks";

function MyComponent() {
  const { execute, loading } = useUploadSessionExport();

  const handleUpload = async (file: File, appointmentId: string) => {
    await execute({ file, appointmentId });
  };

  return (
    // ...
  );
}
```

### Using Pre-built Components

```typescript
import { ProfilePhotoUpload, DocumentUpload } from "@/components/file-upload";

function RegistrationForm() {
  return (
    <>
      <ProfilePhotoUpload
        label="Upload your photo"
        onUploadSuccess={(url, path) => console.log("Uploaded:", url)}
        onUploadError={(err) => console.error("Failed:", err)}
      />

      <DocumentUpload
        label="Upload your license"
        documentType="license"
        onUploadSuccess={(url, path) => console.log("Uploaded:", url)}
        onUploadError={(err) => console.error("Failed:", err)}
      />
    </>
  );
}
```

### Direct API Usage

```typescript
import { uploadsAPI } from "@/lib/api";

const result = await uploadsAPI.uploadProfilePhoto(file);
console.log(result.fileUrl);
```

## Signed URLs

- All file URLs are signed (temporary access tokens)
- Default expiration: 1 hour
- After expiration, use file path to generate new signed URL
- Prevents unauthorized access to files

## Integration with Other APIs

Uploaded URLs are automatically integrated:

- **Profile Photos**: Used in therapist/patient profiles
- **Documents**: Referenced in therapist credentials
- **Recordings**: Linked to mood entries for transcription
- **Exports**: Stored in `appointment.sessionNotes`

## Error Handling

All upload functions throw errors with descriptive messages:

```typescript
try {
  await execute(file);
} catch (error) {
  // Handle specific errors:
  // - "File must be an image"
  // - "File too large (max 5MB)"
  // - "User not authenticated"
  // - "Upload failed: ..."
}
```

## Firebase Cloud Storage Configuration

Ensure Firebase project has:

1. **Cloud Storage bucket created** in Firebase Console
2. **Storage rules configured** (see Security section)
3. **firebase-admin SDK** initialized with credentials

Example rules in `firestore.rules`:
```
service firebase.storagebucket {
  match /b/{bucket}/o {
    match /profile-photos/{userId}/{allPaths=**} {
      allow read: if request.auth.uid != null;
      allow write: if request.auth.uid == userId;
    }
    match /documents/{userId}/{allPaths=**} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId;
    }
    match /recordings/{therapistUid}/{patientId}/{allPaths=**} {
      allow read: if request.auth.uid == therapistUid;
      allow write: if request.auth.uid == therapistUid;
    }
    match /exports/{therapistUid}/{appointmentId}/{allPaths=**} {
      allow read: if request.auth.uid == therapistUid;
      allow write: if request.auth.uid == therapistUid;
    }
  }
}
```

## Performance Considerations

- Use chunked uploads for large files (> 50MB)
- Compress images before upload when possible
- Generate thumbnails for profile photos on client side
- Cache signed URLs with timestamp to minimize regeneration

## Security Notes

- ✅ All uploads require valid Firebase authentication
- ✅ Authorization checks verify user owns the resource
- ✅ File types validated server-side
- ✅ File sizes enforced with limits
- ✅ Signed URLs prevent direct storage access
- ✅ File paths include user IDs for ownership verification
