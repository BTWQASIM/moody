# AI Job Pipeline with Google Gemini

## Overview

The Moody Therapist Portal implements an asynchronous AI job pipeline powered by Google's Gemini free tier models. This enables intelligent features like session summarization, mood analysis, clinical note generation, and risk assessment without blocking user interactions.

**Architecture:**
- **Frontend**: React hooks submit tasks and poll for results
- **Backend**: FastAPI endpoints queue jobs via Celery
- **Queue**: Redis manages task distribution
- **Workers**: Celery processes run Gemini API calls asynchronously
- **AI**: Google Gemini 1.5 Flash (free tier) provides intelligence

## Features

### 1. Session Note Summarization
Automatically summarizes session transcripts or notes into concise clinical summaries.

```typescript
const { execute, loading } = useSummarizeNotes();

await execute({
  appointmentId: "appt_123",
  content: "Long session transcript or notes...",
});
```

**Endpoint:** `POST /api/ai/summarize`

### 2. Mood Analysis
Analyzes mood entries for patterns, concerns, and risk indicators.

```typescript
const { execute, loading } = useAnalyzeMood();

await execute({
  moodEntryId: "mood_456",
  moodDescription: "Feeling anxious and overwhelmed with work stress",
});
```

**Endpoint:** `POST /api/ai/analyze-mood`

### 3. Clinical Notes Generation
Generates professional clinical notes from session transcripts.

```typescript
const { execute, loading } = useGenerateClinicalNotes();

await execute({
  appointmentId: "appt_123",
  transcript: "Session audio transcript...",
  patientName: "John Doe",
  sessionDate: "2026-06-09",
});
```

**Endpoint:** `POST /api/ai/generate-notes`

### 4. Risk Assessment
Evaluates patient context for risk factors and generates alerts.

```typescript
const { execute, loading } = useAssessRisk();

await execute({
  patientId: "patient_789",
  context: "Recent mood entries and session notes...",
});
```

**Endpoint:** `POST /api/ai/assess-risk`

### 5. Action Item Extraction
Extracts concrete action items from session content.

```typescript
const { execute, loading } = useExtractActionItems();

await execute({
  appointmentId: "appt_123",
  content: "Session notes with action items...",
});
```

**Endpoint:** `POST /api/ai/extract-items`

### 6. Progress Report Generation
Generates comprehensive progress reports from multiple sessions.

```typescript
const { execute, loading } = useGenerateProgressReport();

await execute({
  patientId: "patient_789",
});
```

**Endpoint:** `POST /api/ai/progress-report`

## Task Status Polling

All AI tasks are asynchronous. Check status and results:

```typescript
const { data, loading } = useTaskStatus(taskId);

// data structure:
// {
//   taskId: "celery-task-id",
//   status: "pending" | "started" | "SUCCESS" | "FAILURE",
//   result: { ... },  // Only when SUCCESS
//   error: "error message"  // Only when FAILURE
// }
```

**Endpoint:** `GET /api/ai/task-status/{taskId}`

The hook automatically polls every 2 seconds until the task completes.

## Backend Architecture

### Configuration Management (`app/config.py`)

Settings are loaded from environment variables, keeping API keys out of code:

```python
from app.config import settings

# Settings loaded from .env
settings.gemini_api_key  # Stored securely
settings.celery_broker_url  # Redis connection
settings.debug  # Debug mode flag
```

### Gemini AI Client (`app/ai.py`)

Wrapper around Google Generative AI library with specialized methods:

```python
from app.ai import gemini_client

# All methods return None if Gemini is disabled
summary = gemini_client.summarize_text(content)
analysis = gemini_client.analyze_mood(description)
notes = gemini_client.generate_session_notes(transcript, name, date)
risk = gemini_client.assess_risk_level(context)
items = gemini_client.extract_action_items(content)
report = gemini_client.prepare_progress_report(name, count, sessions)
```

**Error Handling:**
- If API key is not set, all methods return `None`
- Failed API calls log errors and return `None`
- Gemini model used: `gemini-1.5-flash` (free tier)

### Celery Tasks (`app/tasks.py`)

Background job processing with automatic retry and error handling:

```python
@celery_app.task(bind=True, max_retries=3)
def summarize_session_notes(self, appointment_id: str, content: str):
    """Summarizes notes and stores in Firestore"""
    # Automatic retry on failure (up to 3 times)
    # Exponential backoff: 60s, 240s, 960s
```

**Task Features:**
- Automatic retries with exponential backoff
- Logging of task progress and errors
- Direct Firestore updates when complete
- Error handling and notification

### API Endpoints (`app/api/ai.py`)

REST endpoints for submitting and monitoring tasks:

```
POST /api/ai/summarize               - Queue summarization
POST /api/ai/analyze-mood            - Queue mood analysis
POST /api/ai/generate-notes          - Queue note generation
POST /api/ai/assess-risk             - Queue risk assessment
POST /api/ai/extract-items           - Queue action item extraction
POST /api/ai/progress-report         - Queue progress report
GET  /api/ai/task-status/{taskId}    - Check task status
```

All endpoints:
- Require Firebase authentication
- Verify resource ownership (therapist can only access own data)
- Return task ID immediately
- Enable async processing

## Setup Instructions

### 1. Install Dependencies

```bash
# Backend
pip install -r requirements.txt

# The following packages are added:
# - google-generativeai>=0.3.0
# - pydantic-settings>=2.0.0
```

### 2. Configure Environment

Add to `backend/.env`:

```env
GEMINI_API_KEY=AIzaSyALUxGEfAu7CDrydZLUnjiMDZribPbxv44

# Celery Configuration
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
```

### 3. Start Redis

```bash
redis-server

# Or using Docker:
docker run -d -p 6379:6379 redis:latest
```

### 4. Start Celery Worker

```bash
# From backend directory
celery -A app.tasks worker --loglevel=info
```

### 5. Start FastAPI Server

```bash
# From backend directory
python -m app.main
```

### 6. Verify Setup

```bash
# Check FastAPI docs
curl http://localhost:8000/docs

# Test Redis connection
redis-cli ping
# Should return: PONG

# Check Celery worker
celery -A app.tasks inspect active
```

## Security Practices

✅ **What We Do:**
- API key stored in `.env` file (never in code)
- Environment variable loaded at runtime via `pydantic-settings`
- `.env` added to `.gitignore` (not committed)
- Each endpoint verifies user authentication
- Authorization checks before processing (therapist ownership)
- Sensitive data not logged

❌ **What to Avoid:**
- Never commit `.env` file to version control
- Never hardcode API keys in source files
- Never log API keys or sensitive data
- Never expose task IDs to unauthorized users

### Environment Variables

For production, set via deployment platform (not `.env`):

```bash
# Heroku
heroku config:set GEMINI_API_KEY=...

# AWS Lambda
aws lambda update-function-configuration \
  --environment Variables={GEMINI_API_KEY=...}

# Docker secrets
docker service create \
  --secret gemini_key \
  --env GEMINI_API_KEY=/run/secrets/gemini_key
```

## Data Flow

### Summarization Example

```
1. Frontend
   └─ User clicks "Generate Summary"
   └─ useSummarizeNotes().execute({ appointmentId, content })
   └─ POST /api/ai/summarize with auth token

2. Backend API Endpoint
   └─ Verify Firebase token
   └─ Check therapist owns appointment
   └─ Queue Celery task
   └─ Return task ID immediately

3. Celery Worker (background)
   └─ Receive summarization task
   └─ Call gemini_client.summarize_text()
   └─ Update appointment in Firestore with summary
   └─ Log completion or error

4. Frontend Polling
   └─ useTaskStatus polls GET /api/ai/task-status/{taskId}
   └─ Every 2 seconds until status = "SUCCESS"
   └─ Display summary to user once complete
```

## Frontend Integration Examples

### With Modal/Dialog

```typescript
import { useSummarizeNotes, useTaskStatus } from "@/lib/hooks";
import { useState } from "react";

export function SummarizeButton({ appointmentId, content }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const { execute, loading: submitting } = useSummarizeNotes();
  const { data: taskStatus, loading: polling } = useTaskStatus(taskId);

  const handleSummarize = async () => {
    const result = await execute({ appointmentId, content });
    setTaskId(result.taskId);
  };

  return (
    <div>
      <button onClick={handleSummarize} disabled={submitting}>
        {submitting ? "Submitting..." : "Summarize"}
      </button>

      {polling && <p>Processing... {taskStatus?.status}</p>}

      {taskStatus?.status === "SUCCESS" && (
        <div className="bg-green-50 p-4 rounded">
          <h3>Summary Complete</h3>
          <p>{taskStatus.result.message}</p>
        </div>
      )}

      {taskStatus?.status === "FAILURE" && (
        <div className="bg-red-50 p-4 rounded">
          <h3>Failed</h3>
          <p>{taskStatus.error}</p>
        </div>
      )}
    </div>
  );
}
```

### With Toast Notifications

```typescript
export function SummarizeWithToast({ appointmentId, content }) {
  const { execute } = useSummarizeNotes();
  const { data: taskStatus } = useTaskStatus(taskId);

  const handleSummarize = async () => {
    try {
      const result = await execute({ appointmentId, content });
      toast.info(`Task queued: ${result.taskId}`);
      setTaskId(result.taskId);
    } catch (error) {
      toast.error(`Failed to submit task: ${error.message}`);
    }
  };

  useEffect(() => {
    if (taskStatus?.status === "SUCCESS") {
      toast.success("Summarization complete!");
    } else if (taskStatus?.status === "FAILURE") {
      toast.error(`Task failed: ${taskStatus.error}`);
    }
  }, [taskStatus]);

  return <button onClick={handleSummarize}>Summarize</button>;
}
```

## Troubleshooting

### Redis Connection Failed

```
Error: Failed to connect to Redis at localhost:6379
```

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# Start Redis
redis-server

# Or check Docker:
docker ps | grep redis
```

### Celery Worker Not Processing Tasks

```
Error: No workers available
```

**Solution:**
```bash
# Ensure worker is running
celery -A app.tasks worker --loglevel=info

# Check active workers
celery -A app.tasks inspect active_queues

# Check if Broker URL is correct
echo $CELERY_BROKER_URL
```

### Gemini API Not Working

```
Error: Invalid API key
```

**Solution:**
1. Check `.env` file has `GEMINI_API_KEY` set
2. Verify key is not in quotes: `GEMINI_API_KEY=AIza...` (not `"AIza..."`)
3. Test the key:
   ```python
   import google.generativeai as genai
   genai.configure(api_key="YOUR_KEY")
   genai.GenerativeModel("gemini-1.5-flash").generate_content("test")
   ```

### Tasks Timing Out

```
Error: Task timed out after 300 seconds
```

**Solution:**
- Adjust Celery timeout in `app/tasks.py`:
  ```python
  celery_app.conf.task_soft_time_limit = 600  # 10 minutes
  celery_app.conf.task_time_limit = 900       # 15 minutes
  ```

## Performance Optimization

### Batch Processing

For multiple patients, submit tasks in parallel:

```typescript
const results = await Promise.all(
  patientIds.map((patientId) =>
    aiAPI.submitProgressReport(patientId)
  )
);
```

### Caching

Cache task results to avoid duplicate processing:

```typescript
const cache = new Map<string, Promise<any>>();

async function getCachedResult(appointmentId: string) {
  if (cache.has(appointmentId)) {
    return cache.get(appointmentId);
  }

  const promise = aiAPI.submitSummarizeTask(appointmentId, content);
  cache.set(appointmentId, promise);
  return promise;
}
```

### Worker Configuration

Scale Celery workers based on load:

```bash
# Single worker with 4 concurrent tasks
celery -A app.tasks worker --concurrency=4

# Multiple workers
celery -A app.tasks worker -l info &
celery -A app.tasks worker -l info &

# With process pool
celery -A app.tasks worker -P prefork --concurrency=8
```

## API Reference

### Request/Response Examples

#### Summarize Session Notes

**Request:**
```json
POST /api/ai/summarize
Authorization: Bearer {token}

{
  "appointmentId": "appt_123",
  "content": "Long session transcript..."
}
```

**Response:**
```json
{
  "status": "queued",
  "taskId": "abc123def456",
  "message": "Summarization task queued"
}
```

**Check Status:**
```
GET /api/ai/task-status/abc123def456
Authorization: Bearer {token}
```

**Status Response (Processing):**
```json
{
  "taskId": "abc123def456",
  "status": "started",
  "result": null,
  "error": null
}
```

**Status Response (Complete):**
```json
{
  "taskId": "abc123def456",
  "status": "SUCCESS",
  "result": {
    "status": "completed",
    "appointmentId": "appt_123"
  },
  "error": null
}
```

## Limitations & Free Tier

**Google Gemini Free Tier Limits:**
- Rate limit: 60 requests per minute
- Daily limit: 1,500 requests per day
- Model: gemini-1.5-flash (latest)
- No credit card required

**Recommended Practices:**
- Batch similar requests together
- Cache results when possible
- Implement request throttling
- Monitor usage in Google Cloud Console

## Next Steps

1. **Monitor Tasks**: Add Celery Flower for web monitoring
   ```bash
   pip install flower
   celery -A app.tasks flower
   # Visit http://localhost:5555
   ```

2. **Error Handling**: Implement retry logic and dead-letter queues
   ```python
   celery_app.conf.task_reject_on_worker_lost = True
   ```

3. **Analytics**: Track task success/failure rates
   ```python
   # Add to task completion
   logger.info(f"Task {task_id} completed in {elapsed_time}s")
   ```

4. **Notifications**: Alert therapist when tasks complete
   ```python
   # Send push notification or email
   db.create_notification(...)
   ```
