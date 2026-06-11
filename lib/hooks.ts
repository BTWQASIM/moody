/**
 * Custom React hooks for API calls
 * Handles loading, error, and data states automatically
 */

"use client";

import { useState, useEffect, useCallback } from "react";
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

interface UseQueryState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Generic hook for fetching data
 */
function useQuery<T>(
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

  const refetch = useCallback(async () => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    let pollTimeout: NodeJS.Timeout;

    const fetch = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const result = await queryFn();
        if (mounted) {
          setState({
            data: result,
            loading: false,
            error: null,
          });

          // Set up polling if requested and data indicates task is still running
          if (
            pollInterval &&
            result.status &&
            ["pending", "started"].includes(result.status)
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
    () => patientAPI.list().then((res) => res.patients || []),
    [refreshKey]
  );
}

/**
 * Hook for getting a specific patient
 */
export function usePatient(patientId: string | null) {
  return useQuery(
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
  return useQuery(() => serviceAPI.list().then((res) => res.services || []));
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
  return useQuery(() =>
    alertsAPI.list().then((res) => res.alerts || [])
  );
}

/**
 * Hook for listing message threads
 */
export function useMessageThreads() {
  return useQuery(() =>
    messagesAPI.listThreads().then((res) => res.threads || [])
  );
}

/**
 * Hook for getting messages in a thread
 */
export function useThreadMessages(threadId: string | null) {
  return useQuery(
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
  return useQuery(() =>
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
  execute: (data: any) => Promise<void>;
}

function useMutation<T>(
  mutationFn: (data: any) => Promise<T>
): UseMutationState<T> {
  const [state, setState] = useState<UseMutationState<T>>({
    data: null,
    loading: false,
    error: null,
    execute: async () => {},
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
 * Hook for submitting mood analysis task
 */
export function useAnalyzeMood() {
  return useMutation(
    ({ moodEntryId, moodDescription }: {
      moodEntryId: string;
      moodDescription: string;
    }) =>
      aiAPI.submitMoodAnalysis(moodEntryId, moodDescription)
  );
}

/**
 * Hook for submitting clinical notes generation
 */
export function useGenerateClinicalNotes() {
  return useMutation(
    ({ appointmentId, transcript, patientName, sessionDate }: {
      appointmentId: string;
      transcript: string;
      patientName: string;
      sessionDate: string;
    }) =>
      aiAPI.submitGenerateNotes(
        appointmentId,
        transcript,
        patientName,
        sessionDate
      )
  );
}

/**
 * Hook for submitting risk assessment
 */
export function useAssessRisk() {
  return useMutation(
    ({ patientId, context }: { patientId: string; context: string }) =>
      aiAPI.submitRiskAssessment(patientId, context)
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
    () =>
      taskId
        ? aiAPI.getTaskStatus(taskId)
        : Promise.resolve({ status: "idle" }),
    [taskId],
    // Poll every 2 seconds if task is running
    taskId ? 2000 : null
  );
}
