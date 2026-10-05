/**
 * Custom React hooks for API calls
 * Handles loading, error, and data states automatically
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  patientAPI,
  appointmentAPI,
  moodAPI,
  notesAPI,
  alertsAPI,
  messagesAPI,
  notificationsAPI,
  serviceAPI,
  uploadsAPI,
  aiAPI,
} from "./api";
import { normalizeTaskStatus } from "./task-status";
import { auth } from "./firebase";

const QUERY_STALE_TIME_MS = 30_000;
const MAX_QUERY_CACHE_ENTRIES = 50;

interface QueryCacheEntry {
  data: unknown;
  cachedAt: number;
}

const queryCache = new Map<string, QueryCacheEntry>();
const inFlightQueries = new Map<string, Promise<unknown>>();
const queryGenerations = new Map<string, number>();
let activeAuthUid: string | null | undefined;

onAuthStateChanged(auth, (user) => {
  const nextAuthUid = user?.uid ?? null;
  if (activeAuthUid !== undefined && activeAuthUid !== nextAuthUid) {
    queryCache.clear();
    inFlightQueries.clear();
    queryGenerations.clear();
  }
  activeAuthUid = nextAuthUid;
});

function getQueryCacheKey(queryKey: string, dependencies: unknown[]) {
  const authUid = auth.currentUser?.uid;
  return authUid
    ? `${authUid}:${queryKey}:${JSON.stringify(dependencies)}`
    : null;
}

function removeStaleQueryCacheEntries(now: number) {
  for (const [key, entry] of queryCache) {
    if (now - entry.cachedAt >= QUERY_STALE_TIME_MS) {
      queryCache.delete(key);
    }
  }
}

function storeQueryResult(key: string, data: unknown) {
  const now = Date.now();
  removeStaleQueryCacheEntries(now);
  queryCache.set(key, { data, cachedAt: now });
  while (queryCache.size > MAX_QUERY_CACHE_ENTRIES) {
    const oldestKey = queryCache.keys().next().value;
    if (!oldestKey) break;
    queryCache.delete(oldestKey);
  }
}

function runSharedQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  forceRefresh: boolean
): Promise<T> {
  const now = Date.now();
  if (!forceRefresh) {
    const cached = queryCache.get(key);
    if (cached) {
      if (now - cached.cachedAt < QUERY_STALE_TIME_MS) {
        return Promise.resolve(cached.data as T);
      }
      queryCache.delete(key);
    }

    const inFlight = inFlightQueries.get(key);
    if (inFlight) return inFlight as Promise<T>;
  }

  const generation = (queryGenerations.get(key) ?? 0) + 1;
  queryGenerations.set(key, generation);
  const request = queryFn()
    .then((result) => {
      if (queryGenerations.get(key) === generation) {
        storeQueryResult(key, result);
      }
      return result;
    })
    .finally(() => {
      if (inFlightQueries.get(key) === request) {
        inFlightQueries.delete(key);
      }
    });

  inFlightQueries.set(key, request);
  return request;
}

interface UseQueryState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Generic hook for fetching data
 */
function useQuery<T>(
  queryKey: string,
  queryFn: () => Promise<any>,
  dependencies: any[] = [],
  pollInterval: number | null = null
): UseQueryState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<UseQueryState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);
  const previousReloadToken = useRef(0);

  const refetch = useCallback(async () => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    let pollTimeout: NodeJS.Timeout;

    const fetch = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const cacheKey = getQueryCacheKey(queryKey, dependencies);
        const forceRefresh = reloadToken !== previousReloadToken.current;
        previousReloadToken.current = reloadToken;
        const result =
          pollInterval || !cacheKey
            ? await queryFn()
            : await runSharedQuery(cacheKey, queryFn, forceRefresh);
        if (mounted) {
          const normalizedResult =
            result && typeof result.status === "string"
              ? { ...result, status: normalizeTaskStatus(result.status) }
              : result;
          setState({
            data: normalizedResult,
            loading: false,
            error: null,
          });

          // Set up polling if requested and data indicates task is still running
          if (
            pollInterval &&
            normalizedResult.status &&
            ["pending", "processing"].includes(normalizedResult.status)
          ) {
            pollTimeout = setTimeout(fetch, pollInterval);
          }
        }
      } catch (err) {
        if (mounted) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    };

    fetch();
    return () => {
      mounted = false;
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [...dependencies, reloadToken]);

  return { ...state, refetch };
}

/**
 * Hook for listing all patients
 */
export function usePatients(refreshKey = 0) {
  return useQuery(
    "patients",
    () => patientAPI.list().then((res) => res.patients || []),
    [refreshKey]
  );
}

/**
 * Hook for getting a specific patient
 */
export function usePatient(patientId: string | null) {
  return useQuery(
    "patient",
    () =>
      patientId
        ? patientAPI.get(patientId).then((res) => res.patient ?? null)
        : Promise.resolve(null),
    [patientId]
  );
}

/**
 * Hook for listing appointments
 */
export function useAppointments(filters?: {
  patientId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery(
    "appointments",
    () =>
      appointmentAPI
        .list(filters)
        .then((res) => res.appointments || []),
    [filters?.patientId, filters?.startDate, filters?.endDate]
  );
}

/**
 * Hook for getting a specific appointment
 */
export function useAppointment(appointmentId: string | null) {
  return useQuery(
    "appointment",
    () =>
      appointmentId
        ? appointmentAPI.get(appointmentId)
        : Promise.resolve({ appointment: null }),
    [appointmentId]
  );
}

/**
 * Hook for listing services
 */
export function useServices() {
  return useQuery("services", () =>
    serviceAPI.list().then((res) => res.services || [])
  );
}

/**
 * Hook for fetching a patient's mobile app activity (mood check-ins + journal entries).
 * Requires the patient to be linked via patientAPI.linkFirebaseUid first.
 */
export function usePatientMobileActivity(
  patientId: string | null,
  limit = 30,
  refreshKey = 0
) {
  return useQuery(
    "patient-mobile-activity",
    () =>
      patientId
        ? patientAPI
            .getMobileActivity(patientId, limit)
            .then((res) => res)
        : Promise.resolve({
            linked: false,
            moodCheckins: [],
            journalEntries: [],
          }),
    [patientId, limit, refreshKey]
  );
}

/**
 * Hook for listing mood entries
 */
export function useMoodEntries(patientId: string | null) {
  return useQuery(
    "mood-entries",
    () =>
      patientId
        ? moodAPI.list(patientId).then((res) => res.entries || [])
        : Promise.resolve([]),
    [patientId]
  );
}

/**
 * Hook for listing clinical notes
 */
export function useClinicalNotes(patientId: string | null) {
  return useQuery(
    "clinical-notes",
    () =>
      patientId
        ? notesAPI.list(patientId).then((res) => res.notes || [])
        : Promise.resolve([]),
    [patientId]
  );
}

/**
 * Hook for listing risk alerts
 */
export function useRiskAlerts() {
  return useQuery("risk-alerts", () =>
    alertsAPI.list().then((res) => res.alerts || [])
  );
}

/**
 * Hook for listing message threads
 */
export function useMessageThreads() {
  return useQuery("message-threads", () =>
    messagesAPI.listThreads().then((res) => res.threads || [])
  );
}

/**
 * Hook for getting messages in a thread
 */
export function useThreadMessages(threadId: string | null) {
  return useQuery(
    "thread-messages",
    () =>
      threadId
        ? messagesAPI
            .getThreadMessages(threadId)
            .then((res) => res.messages || [])
        : Promise.resolve([]),
    [threadId]
  );
}

/**
 * Hook for notifications
 */
export function useNotifications() {
  return useQuery("notifications", () =>
    notificationsAPI.list().then((res) => res.notifications || [])
  );
}

/**
 * Hook for creating data with manual refresh
 */
interface UseMutationState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (data: any) => Promise<T>;
}

function useMutation<T>(
  mutationFn: (data: any) => Promise<T>
): UseMutationState<T> {
  const [state, setState] = useState<UseMutationState<T>>({
    data: null,
    loading: false,
    error: null,
    execute: async () => {
      throw new Error("Mutation is not initialized");
    },
  });

  const execute = useCallback(
    async (data: any) => {
      try {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: null,
        }));
        const result = await mutationFn(data);
        setState((prev) => ({
          ...prev,
          data: result,
          loading: false,
        }));
        return result;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({
          ...prev,
          error,
          loading: false,
        }));
        throw error;
      }
    },
    [mutationFn]
  );

  return {
    ...state,
    execute,
  };
}

/**
 * Hook for creating a patient
 */
export function useCreatePatient() {
  return useMutation((data) =>
    patientAPI.create(data).then((res) => res)
  );
}

/**
 * Hook for updating a patient
 */
export function useUpdatePatient() {
  return useMutation(({ patientId, ...data }) =>
    patientAPI.update(patientId, data).then((res) => res)
  );
}

/**
 * Hook for linking a patient's mobile Firebase UID
 */
export function useLinkPatientFirebaseUid() {
  return useMutation(
    ({ patientId, firebaseUid }: { patientId: string; firebaseUid: string }) =>
      patientAPI.linkFirebaseUid(patientId, firebaseUid).then((res) => res)
  );
}

/**
 * Hook for removing a patient's mobile Firebase UID link
 */
export function useUnlinkPatientFirebaseUid() {
  return useMutation((patientId: string) =>
    patientAPI.unlinkFirebaseUid(patientId).then((res) => res)
  );
}

/**
 * Hook for creating an appointment
 */
export function useCreateAppointment() {
  return useMutation((data) =>
    appointmentAPI.create(data).then((res) => res)
  );
}

/**
 * Hook for updating an appointment
 */
export function useUpdateAppointment() {
  return useMutation(({ appointmentId, ...data }) =>
    appointmentAPI.update(appointmentId, data).then((res) => res)
  );
}

/**
 * Hook for confirming an appointment
 */
export function useConfirmAppointment() {
  return useMutation((appointmentId: string) =>
    appointmentAPI.confirm(appointmentId).then((res) => res)
  );
}

/**
 * Hook for cancelling an appointment
 */
export function useCancelAppointment() {
  return useMutation((appointmentId: string) =>
    appointmentAPI.cancel(appointmentId).then((res) => res)
  );
}

/**
 * Hook for creating a mood entry
 */
export function useCreateMoodEntry() {
  return useMutation((data) =>
    moodAPI.create(data).then((res) => res)
  );
}

/**
 * Hook for creating a clinical note
 */
export function useCreateClinicalNote() {
  return useMutation((data) =>
    notesAPI.create(data).then((res) => res)
  );
}

/**
 * Hook for creating a risk alert
 */
export function useCreateRiskAlert() {
  return useMutation((data) =>
    alertsAPI.create(data).then((res) => res)
  );
}

/**
 * Hook for creating a message thread
 */
export function useCreateThread() {
  return useMutation((data) =>
    messagesAPI.createThread(data).then((res) => res)
  );
}

/**
 * Hook for sending a message
 */
export function useSendMessage() {
  return useMutation((data) =>
    messagesAPI.sendMessage(data).then((res) => res)
  );
}

/**
 * Hook for uploading profile photo
 */
export function useUploadProfilePhoto() {
  return useMutation((file: File) =>
    uploadsAPI.uploadProfilePhoto(file)
  );
}

/**
 * Hook for uploading documents (license, certification, etc.)
 */
export function useUploadDocument() {
  return useMutation(
    ({ file, documentType }: { file: File; documentType: string }) =>
      uploadsAPI.uploadDocument(file, documentType)
  );
}

/**
 * Hook for uploading audio recordings
 */
export function useUploadAudioRecording() {
  return useMutation(
    ({ file, patientId, sessionDate }: {
      file: File;
      patientId: string;
      sessionDate: string;
    }) =>
      uploadsAPI.uploadAudioRecording(file, patientId, sessionDate)
  );
}

/**
 * Hook for uploading session exports (PDF, transcript)
 */
export function useUploadSessionExport() {
  return useMutation(
    ({ file, appointmentId }: { file: File; appointmentId: string }) =>
      uploadsAPI.uploadSessionExport(file, appointmentId)
  );
}

/**
 * Hook for deleting uploaded files
 */
export function useDeleteFile() {
  return useMutation((filePath: string) =>
    uploadsAPI.deleteFile(filePath)
  );
}

/**
 * Hook for submitting summarization task
 */
export function useSummarizeNotes() {
  return useMutation(
    ({ appointmentId, content }: { appointmentId: string; content: string }) =>
      aiAPI.submitSummarizeTask(appointmentId, content)
  );
}

/**
 * Hook for submitting action items extraction
 */
export function useExtractActionItems() {
  return useMutation(
    ({ appointmentId, content }: { appointmentId: string; content: string }) =>
      aiAPI.submitExtractItems(appointmentId, content)
  );
}

/**
 * Hook for submitting progress report generation
 */
export function useGenerateProgressReport() {
  return useMutation((patientId: string) =>
    aiAPI.submitProgressReport(patientId)
  );
}

/**
 * Hook for polling task status
 */
export function useTaskStatus(taskId: string | null) {
  return useQuery(
    "task-status",
    () =>
      taskId
        ? aiAPI.getTaskStatus(taskId)
        : Promise.resolve({ status: "idle" }),
    [taskId],
    // Poll every 2 seconds if task is running
    taskId ? 2000 : null
  );
}
