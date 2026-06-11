/**
 * Typed API client for calling Moody Therapist Portal backend
 * Automatically includes Firebase ID tokens in all requests
 */

import { auth } from "./firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Get Firebase ID token for authenticated requests
 */
async function getAuthToken(): Promise<string> {
  if (!auth.currentUser) {
    throw new Error("User not authenticated");
  }
  return await auth.currentUser.getIdToken();
}

/**
 * Make an API request with automatic token handling
 */
async function apiCall(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: any
): Promise<any> {
  const token = await getAuthToken();

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const detail = errorBody.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(", ")
          : `API error: ${response.status}`;
    throw new Error(message || `API error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Make a file upload request with automatic token handling
 */
async function uploadFile(
  endpoint: string,
  file: File,
  additionalData?: Record<string, string>
): Promise<any> {
  const token = await getAuthToken();

  const formData = new FormData();
  formData.append("file", file);

  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  const options: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Upload failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Patients API
 */
export const patientAPI = {
  async list() {
    return apiCall("/api/patients/");
  },

  async get(patientId: string) {
    return apiCall(`/api/patients/${patientId}`);
  },

  async create(data: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    emergencyContact?: string;
    insurance?: string;
  }) {
    return apiCall("/api/patients/", "POST", data);
  },

  async update(
    patientId: string,
    data: Record<string, any>
  ) {
    return apiCall(`/api/patients/${patientId}`, "PATCH", data);
  },

  async delete(patientId: string) {
    return apiCall(`/api/patients/${patientId}`, "DELETE");
  },

  /** Link a patient's mobile Firebase Auth UID to their portal record. */
  async linkFirebaseUid(patientId: string, firebaseUid: string) {
    return apiCall(`/api/patients/${patientId}/link`, "PATCH", { firebaseUid });
  },

  /** Remove the Firebase UID link from a patient record. */
  async unlinkFirebaseUid(patientId: string) {
    return apiCall(`/api/patients/${patientId}/link`, "DELETE");
  },

  /** Fetch mood check-ins and journal entries from the mobile app for a patient. */
  async getMobileActivity(patientId: string, limit = 30) {
    return apiCall(
      `/api/patients/${patientId}/mobile-activity?limit=${limit}`
    );
  },
};

/**
 * Appointments API
 */
export const appointmentAPI = {
  async list(filters?: {
    patientId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    let url = "/api/appointments/";
    if (filters) {
      const params = new URLSearchParams();
      if (filters.patientId) params.append("patient_id", filters.patientId);
      if (filters.startDate) params.append("start_date", filters.startDate);
      if (filters.endDate) params.append("end_date", filters.endDate);
      if (params.toString()) url += "?" + params.toString();
    }
    return apiCall(url);
  },

  async get(appointmentId: string) {
    return apiCall(`/api/appointments/${appointmentId}`);
  },

  async create(data: {
    patientId: string;
    scheduledAt: string;
    duration: number;
    type: string;
    notes?: string;
  }) {
    return apiCall("/api/appointments/", "POST", data);
  },

  async update(
    appointmentId: string,
    data: Record<string, any>
  ) {
    return apiCall(`/api/appointments/${appointmentId}`, "PATCH", data);
  },

  async confirm(appointmentId: string) {
    return apiCall(`/api/appointments/${appointmentId}/confirm`, "POST");
  },

  async cancel(appointmentId: string) {
    return apiCall(`/api/appointments/${appointmentId}/cancel`, "POST");
  },
};

/**
 * Services API
 */
export const serviceAPI = {
  async list() {
    return apiCall("/api/services/");
  },

  async create(data: {
    name: string;
    description: string;
    duration: number;
    price: number;
  }) {
    return apiCall("/api/services/", "POST", data);
  },

  async update(serviceId: string, data: Record<string, any>) {
    return apiCall(`/api/services/${serviceId}`, "PATCH", data);
  },

  async delete(serviceId: string) {
    return apiCall(`/api/services/${serviceId}`, "DELETE");
  },
};

/**
 * Mood Entries API
 */
export const moodAPI = {
  async list(patientId: string, limit = 30) {
    return apiCall(`/api/mood/entries/${patientId}?limit=${limit}`);
  },

  async create(data: {
    patientId: string;
    moodScore: number;
    emotionalState: string;
    triggers?: string[];
    symptoms?: string[];
    notes?: string;
  }) {
    return apiCall("/api/mood/entries", "POST", data);
  },
};

/**
 * Clinical Notes API
 */
export const notesAPI = {
  async list(patientId: string) {
    return apiCall(`/api/notes/${patientId}`);
  },

  async create(data: {
    patientId: string;
    appointmentId?: string;
    content: string;
    confidential?: boolean;
    tags?: string[];
  }) {
    return apiCall("/api/notes/", "POST", data);
  },
};

/**
 * Risk Alerts API
 */
export const alertsAPI = {
  async list() {
    return apiCall("/api/alerts/");
  },

  async create(data: {
    patientId: string;
    title: string;
    description: string;
    riskLevel: "low" | "medium" | "high" | "critical";
  }) {
    return apiCall("/api/alerts/", "POST", data);
  },

  async acknowledge(alertId: string) {
    return apiCall(`/api/alerts/${alertId}/acknowledge`, "POST");
  },
};

/**
 * Messages API
 */
export const messagesAPI = {
  async listThreads() {
    return apiCall("/api/messages/threads");
  },

  async createThread(data: {
    patientId: string;
    subject: string;
  }) {
    return apiCall("/api/messages/threads", "POST", data);
  },

  async getThreadMessages(threadId: string) {
    return apiCall(`/api/messages/threads/${threadId}`);
  },

  async sendMessage(data: {
    threadId: string;
    recipientId: string;
    content: string;
    attachments?: any[];
  }) {
    return apiCall("/api/messages/", "POST", data);
  },
};

/**
 * Notifications API
 */
export const notificationsAPI = {
  async list() {
    return apiCall("/api/notifications/");
  },
};

/**
 * File Uploads API
 */
export const uploadsAPI = {
  async uploadProfilePhoto(file: File) {
    return uploadFile("/api/uploads/profile-photo", file);
  },

  async uploadDocument(file: File, documentType: string) {
    return uploadFile("/api/uploads/document", file, { documentType });
  },

  async uploadAudioRecording(
    file: File,
    patientId: string,
    sessionDate: string
  ) {
    return uploadFile("/api/uploads/audio-recording", file, {
      patientId,
      sessionDate,
    });
  },

  async uploadSessionExport(file: File, appointmentId: string) {
    return uploadFile("/api/uploads/session-export", file, {
      appointmentId,
    });
  },

  async deleteFile(filePath: string) {
    return apiCall(`/api/uploads/${encodeURIComponent(filePath)}`, "DELETE");
  },
};

/**
 * AI Operations API
 */
export const aiAPI = {
  async submitSummarizeTask(appointmentId: string, content: string) {
    return apiCall("/api/ai/summarize", "POST", {
      appointmentId,
      content,
    });
  },

  async submitMoodAnalysis(moodEntryId: string, moodDescription: string) {
    return apiCall("/api/ai/analyze-mood", "POST", {
      moodEntryId,
      moodDescription,
    });
  },

  async submitGenerateNotes(
    appointmentId: string,
    transcript: string,
    patientName: string,
    sessionDate: string
  ) {
    return apiCall("/api/ai/generate-notes", "POST", {
      appointmentId,
      transcript,
      patientName,
      sessionDate,
    });
  },

  async submitRiskAssessment(patientId: string, context: string) {
    return apiCall("/api/ai/assess-risk", "POST", {
      patientId,
      context,
    });
  },

  async submitExtractItems(appointmentId: string, content: string) {
    return apiCall("/api/ai/extract-items", "POST", {
      appointmentId,
      content,
    });
  },

  async submitProgressReport(patientId: string) {
    return apiCall("/api/ai/progress-report", "POST", {
      patientId,
    });
  },

  async getTaskStatus(taskId: string) {
    return apiCall(`/api/ai/task-status/${taskId}`);
  },
};
