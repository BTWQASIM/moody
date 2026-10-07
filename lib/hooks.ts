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
  notificationsAPI,
  serviceAPI,
  uploadsAPI,
  aiAPI,
} from "./api";
import { normalizeTaskStatus } from "./task-status";
import { auth } from "./firebase";

const QUERY_STALE_TIME_MS = 30_000;
const MAX_QUERY_CACHE_ENTRIES = 50;
const BACKGROUND_REFRESH_INTERVAL_MS = 7_000;
const BACKGROUND_REFRESH_QUERY_KEYS = new Set([
  "patients",
  "patient",
  "appointments",
  "risk-alerts",
  "notifications",
  "mood-entries",
  "clinical-notes",
  "patient-mobile-activity",
]);

interface QueryCacheEntry {
  data: unknown;
  cachedAt: number;
}

const queryCache = new Map<string, QueryCacheEntry>();
const inFlightQueries = new Map<string, Promise<unknown>>();
const queryGenerations = new Map<string, number>();
const querySubscribers = new Map<string, Set<() => void>>();
const queryPollers = new Map<
  string,
  { queryFn: () => Promise<unknown>; timer: ReturnType<typeof setTimeout> | null }
>();
let activeAuthUid: string | null | undefined;
let visibilityListenerInstalled = false;

onAuthStateChanged(auth, (user) => {
  const nextAuthUid = user?.uid ?? null;
  if (activeAuthUid !== undefined && activeAuthUid !== nextAuthUid) {
    queryCache.clear();
    inFlightQueries.clear();
    queryGenerations.clear();
    queryPollers.forEach((poller) => {
      if (poller.timer) clearTimeout(poller.timer);
    });
    queryPollers.clear();
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

export function invalidateQueryCache(
  queryKey: string,
  dependencies?: unknown[]
) 
{
  if (dependencies) {
    const cacheKey = buildQueryCacheKey(queryKey, dependencies)
    queryCache.delete(cacheKey)

    // Immediately refresh the mounted query if it has a background poller.
    const poller = queryPollers.get(cacheKey)
    if (poller) {
      void runSharedQuery(cacheKey, poller.queryFn, true)
    }

    return
  }

  // No dependencies means invalidate every cached query for this query type.
  for (const cacheKey of Array.from(queryCache.keys())) {
    if (!cacheKey.includes(`:${queryKey}:`)) {
      continue
    }

    queryCache.delete(cacheKey)

    // Immediately refresh any mounted instance of this query.
    const poller = queryPollers.get(cacheKey)
    if (poller) {
      void runSharedQuery(cacheKey, poller.queryFn, true)
    }
  }




  // Immediately refresh mounted queries instead of waiting
  // for the next background polling interval.
  for (const key of keysToRefresh) {
    const poller = queryPollers.get(key);

    if (poller) {
      void runSharedQuery(key, poller.queryFn, true)
        .then(() => notifyQuerySubscribers(key))
        .catch(() => {
          // Keep the currently displayed data if the refresh fails.
        });
    }
  }
}

function notifyQuerySubscribers(key: string) {
  querySubscribers.get(key)?.forEach((notify) => notify());
}

function scheduleQueryPoll(key: string) {
  const poller = queryPollers.get(key);
  if (
    !poller ||
    (typeof document !== "undefined" &&
      document.visibilityState === "hidden")
  ) {
    return;
  }

  poller.timer = setTimeout(async () => {
    const current = queryPollers.get(key);
    if (!current) return;

    try {
      await runSharedQuery(key, current.queryFn, true);
      notifyQuerySubscribers(key);
    } catch {
      // Keep the last successful result visible until the next refresh.
    } finally {
      scheduleQueryPoll(key);
    }
  }, BACKGROUND_REFRESH_INTERVAL_MS);
}

function startQueryPoll(
  cacheKey: string,
  queryKey: string,
  queryFn: () => Promise<unknown>
) {
  if (!BACKGROUND_REFRESH_QUERY_KEYS.has(queryKey) || queryPollers.has(cacheKey)) return;
  queryPollers.set(cacheKey, { queryFn, timer: null });
  scheduleQueryPoll(cacheKey);
}

function stopQueryPoll(key: string) {
  const poller = queryPollers.get(key);
  if (!poller) return;
  if (poller.timer) clearTimeout(poller.timer);
  queryPollers.delete(key);
}

function subscribeToQuery(
  cacheKey: string,
  queryKey: string,
  queryFn: () => Promise<unknown>,
  notify: () => void
) {
  let subscribers = querySubscribers.get(cacheKey);
  if (!subscribers) {
    subscribers = new Set();
    querySubscribers.set(cacheKey, subscribers);
  }
  subscribers.add(notify);
  startQueryPoll(cacheKey, queryKey, queryFn);

  if (!visibilityListenerInstalled && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled = true;
  }

  return () => {
    subscribers?.delete(notify);
    if (subscribers?.size === 0) {
      querySubscribers.delete(cacheKey);
      stopQueryPoll(cacheKey);
    }
    if (querySubscribers.size === 0 && visibilityListenerInstalled) {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      visibilityListenerInstalled = false;
    }
  };
}

function handleVisibilityChange() {
  if (typeof document === "undefined" || document.visibilityState === "hidden") return;

  queryPollers.forEach((poller, key) => {
    if (poller.timer) clearTimeout(poller.timer);
    poller.timer = null;
    void runSharedQuery(key, poller.queryFn, true)
      .then(() => notifyQuerySubscribers(key))
      .catch(() => {
        // Keep the last successful result visible until the next refresh.
      })
      .finally(() => scheduleQueryPoll(key));
  });
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

  }

  const inFlight = inFlightQueries.get(key);
  if (inFlight) return inFlight as Promise<T>;

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
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;
    let shouldPoll = false;
    const cacheKey = getQueryCacheKey(queryKey, dependencies);
    const notify = () => {
      if (!mounted || !cacheKey) return;
      const cached = queryCache.get(cacheKey);
      if (!cached) return;
      const normalizedResult =
        cached.data && typeof (cached.data as any).status === "string"
          ? { ...(cached.data as any), status: normalizeTaskStatus((cached.data as any).status) }
          : cached.data;
      setState({
        data: normalizedResult as T,
        loading: false,
        error: null,
      });
    };

    if (cacheKey) {
      const cached = queryCache.get(cacheKey);
      if (cached) {
        notify();
      }
    }

    const fetch = async () => {
      try {
        setState((prev) => ({
          ...prev,
          loading: prev.data === null,
          error: null,
        }));
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
          if (cacheKey) notifyQuerySubscribers(cacheKey);

          if (
            pollInterval &&
            normalizedResult.status &&
            ["pending", "processing"].includes(normalizedResult.status)
          ) {
            shouldPoll = true;
            if (
              typeof document === "undefined" ||
              document.visibilityState !== "hidden"
            ) {
              pollTimeout = setTimeout(fetch, pollInterval);
            }
          } else {
            shouldPoll = false;
          }
        }
      } catch (err) {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          }));
        }
      }
    };

    const handleTaskVisibilityChange = () => {
      if (
        pollInterval &&
        shouldPoll &&
        document.visibilityState === "visible" &&
        mounted
      ) {
        if (pollTimeout) clearTimeout(pollTimeout);
        pollTimeout = null;
        void fetch();
      }
    };

    const unsubscribe = cacheKey
      ? subscribeToQuery(cacheKey, queryKey, queryFn, notify)
      : undefined;
    if (pollInterval && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleTaskVisibilityChange);
    }
    fetch();
    return () => {
      mounted = false;
      if (pollTimeout) clearTimeout(pollTimeout);
      if (pollInterval && typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleTaskVisibilityChange
        );
      }
      unsubscribe?.();
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
 * Deactivate a patient without deleting their historical records.
 */
export function useDeletePatient() {
  return useMutation((patientId: string) =>
    patientAPI.delete(patientId).then((res) => res)
  );
}

/**
 * Hook for linking a patient's mobile Firebase UID
 */
export function useLinkPatientFirebaseUid() {
  return useMutation(
    async ({
      patientId,
      firebaseUid,
    }: {
      patientId: string
      firebaseUid: string
    }) => {
      const result = await patientAPI.linkFirebaseUid(patientId, firebaseUid)

      // Refresh the patient profile and its mobile activity immediately.
      invalidateQueryCache("patient", [patientId])
      invalidateQueryCache("patient-mobile-activity", [patientId, 30, 0])

      return result
    }
  )
}

export function useUnlinkPatientFirebaseUid() {
  return useMutation(async (patientId: string) => {
    const result = await patientAPI.unlinkFirebaseUid(patientId)

    // Refresh the patient profile and its mobile activity immediately.
    invalidateQueryCache("patient", [patientId])
    invalidateQueryCache("patient-mobile-activity", [patientId, 30, 0])

    return result
  })
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
 * Hook for extracting text from an uploaded notes document
 */
export function useExtractNotesFile() {
  return useMutation((file: File) => aiAPI.extractNotesFile(file));
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
