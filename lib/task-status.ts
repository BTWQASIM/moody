export type TaskStatus = "pending" | "processing" | "completed" | "failed"

const statusMap: Record<string, TaskStatus> = {
  queued: "pending",
  pending: "pending",
  started: "processing",
  processing: "processing",
  success: "completed",
  completed: "completed",
  failure: "failed",
  failed: "failed",
}

export function normalizeTaskStatus(status?: string): TaskStatus {
  if (!status) return "pending"
  return statusMap[status.toLowerCase()] ?? "pending"
}
