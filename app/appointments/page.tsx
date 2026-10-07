"use client"

import { useState, useMemo, useEffect } from "react"
import { ProtectedRoute } from "@/app/protected-route"
import { PortalShell } from "@/components/portal-shell"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  useAppointments,
  usePatients,
  useCreateAppointment,
  useConfirmAppointment,
  useCancelAppointment,
  useUpdateAppointment,
} from "@/lib/hooks"
import {
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Plus,
  AlertTriangle,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  getResolvedPatientName,
  resolvePortalPatientId,
} from "@/lib/patient-mapping"

// ============================================================================
// Type Definitions
// ============================================================================

interface Appointment {
  id?: string
  therapistUid?: string
  patientId?: string
  /** Denormalized patient name — present on mobile-originated appointments */
  patientName?: string
  patientEmail?: string
  /** Denormalized therapist name — present on mobile-originated appointments */
  therapistName?: string
  scheduledAt?: string | Date
  duration?: number
  type?: string
  status?: string
  notes?: string
  sessionNotes?: string
  sessionSummary?: string
  createdAt?: string | Date
  /** "mobile" when the request was created by the patient app */
  source?: string
  portalPatientId?: string
}

interface Patient {
  id?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  profilePhoto?: string
  riskLevel?: string
  firebaseUid?: string
}

// ============================================================================
// Helpers
// ============================================================================

function toDatetimeLocalValue(value?: string | Date) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resolvePatientName(apt: Appointment, patients: Patient[]): string {
  return (
    getResolvedPatientName(apt, patients) ||
    (apt.patientName &&
    !["unknown", "individual", "n/a"].includes(apt.patientName.trim().toLowerCase())
      ? apt.patientName.trim()
      : "Unknown Patient")
  )
}

// ============================================================================
// Status Badge Component
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: "Pending", color: "text-yellow-600", bgColor: "bg-yellow-50 border-yellow-200" },
  confirmed: { label: "Confirmed", color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200" },
  completed: { label: "Completed", color: "text-green-600", bgColor: "bg-green-50 border-green-200" },
  cancelled: { label: "Cancelled", color: "text-red-600", bgColor: "bg-red-50 border-red-200" },
  rescheduled: { label: "Rescheduled", color: "text-purple-600", bgColor: "bg-purple-50 border-purple-200" },
  no_show: { label: "No Show", color: "text-red-700", bgColor: "bg-red-100 border-red-300" },
}

function StatusBadge({ status }: { status?: string }) {
  const config = STATUS_CONFIG[status || "pending"]
  return (
    <Badge variant="outline" className={`border ${config.bgColor} ${config.color}`}>
      {config.label}
    </Badge>
  )
}

// ============================================================================
// Appointment List View
// ============================================================================

function AppointmentListView({
  appointments,
  patients,
  loading,
  onSelectAppointment,
}: {
  appointments: Appointment[]
  patients: Patient[]
  loading: boolean
  onSelectAppointment: (apt: Appointment) => void
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const totalPages = Math.ceil(appointments.length / itemsPerPage)
  const startIdx = (currentPage - 1) * itemsPerPage
  const paginatedAppointments = appointments.slice(startIdx, startIdx + itemsPerPage)

  /** Resolve patient name from portal roster or appointment snapshot. */
  const getPatientName = (apt: Appointment): string => resolvePatientName(apt, patients)

  const formatDateTime = (date?: string | Date): { date: string; time: string } => {
    if (!date) return { date: "", time: "" }
    const d = new Date(date)
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
    return { date: dateStr, time: timeStr }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 text-center">
          <Calendar className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-muted-foreground">No appointments scheduled</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first appointment to get started</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {paginatedAppointments.map((apt) => {
        const { date, time } = formatDateTime(apt.scheduledAt)
        const patientName = getPatientName(apt)
        const isMobileRequest = apt.source === "mobile"
        const portalPatientId = resolvePortalPatientId(apt, patients)

        return (
          <Card
            key={apt.id}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() => onSelectAppointment(apt)}
          >
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold">{patientName}</h3>
                    <StatusBadge status={apt.status} />
                    {isMobileRequest && (
                      <Badge
                        variant="outline"
                        className="border border-violet-200 bg-violet-50 text-violet-700 text-xs"
                      >
                        Patient Request
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-4" />
                      {date}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="size-4" />
                      {time} • {apt.duration} mins
                    </div>
                    {apt.type && <p>Type: {apt.type}</p>}
                    {apt.notes && <p className="line-clamp-1">Notes: {apt.notes}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {portalPatientId ? (
                    <Link
                      href={`/patients/${portalPatientId}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button size="sm" variant="outline" title="Open patient profile">
                        <User className="size-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Accept the request to add this patient to your roster"
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectAppointment(apt)
                      }}
                    >
                      <User className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Appointment Week View
// ============================================================================

function AppointmentWeekView({
  appointments,
  patients,
  onSelectAppointment,
}: {
  appointments: Appointment[]
  patients: Patient[]
  onSelectAppointment: (apt: Appointment) => void
}) {
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek)
    date.setDate(date.getDate() + i)
    return date
  })

  const getPatientName = (apt: Appointment): string => {
    const portalId = resolvePortalPatientId(apt, patients)
    const patient = patients.find(
      (p) => p.id === portalId || p.firebaseUid === apt.patientId,
    )
    if (patient) {
      const first = (patient.firstName || "")[0] ?? ""
      const last = (patient.lastName || "")[0] ?? ""
      return first + last || "?"
    }
    const full = apt.patientName
    if (full) return `${full[0] ?? ""}${full.split(" ")[1]?.[0] ?? ""}`.toUpperCase() || "?"
    return "?"
  }

  const appointmentsForDay = (dayDate: Date) => {
    return appointments.filter((apt) => {
      if (!apt.scheduledAt) return false
      const aptDate = new Date(apt.scheduledAt)
      return (
        aptDate.getDate() === dayDate.getDate() &&
        aptDate.getMonth() === dayDate.getMonth() &&
        aptDate.getFullYear() === dayDate.getFullYear()
      )
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((date) => {
          const dayAppts = appointmentsForDay(date)
          const isToday =
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()

          return (
            <Card
              key={date.toISOString()}
              className={cn("min-h-40", isToday && "border-primary bg-primary/5")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                  <br />
                  {date.getDate()}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {dayAppts.map((apt) => (
                  <div
                    key={apt.id}
                    className="cursor-pointer rounded bg-blue-100 p-1 text-xs font-medium text-blue-900 hover:bg-blue-200 transition-colors"
                    onClick={() => onSelectAppointment(apt)}
                  >
                    {new Date(apt.scheduledAt!).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                    <br />
                    {getPatientName(apt)}
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Create Appointment Dialog
// ============================================================================

function CreateAppointmentDialog({
  open,
  onOpenChange,
  patients,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: Patient[]
  onCreated: () => void | Promise<void>
}) {
  const { execute, loading, error } = useCreateAppointment()
  const [formData, setFormData] = useState({
    patientId: "",
    scheduledAt: "",
    startTime: "09:00",
    duration: "60",
    type: "follow-up",
    notes: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.patientId || !formData.scheduledAt) {
      alert("Please fill in required fields")
      return
    }

    const [year, month, day] = formData.scheduledAt.split("-")
    const [hour, minute] = formData.startTime.split(":")
    const scheduledAt = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute)
    ).toISOString()

    try {
      await execute({
        patientId: formData.patientId,
        scheduledAt,
        duration: parseInt(formData.duration),
        type: formData.type,
        notes: formData.notes,
      })

      await onCreated()
      setFormData({
        patientId: "",
        scheduledAt: "",
        startTime: "09:00",
        duration: "60",
        type: "follow-up",
        notes: "",
      })

      onOpenChange(false)
    } catch (err) {
      console.error("Failed to create appointment:", err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule New Appointment</DialogTitle>
          <DialogDescription>
            Create a new appointment for a patient in your practice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="patient">Patient *</Label>
            <Select value={formData.patientId} onValueChange={(v) => setFormData({ ...formData, patientId: v ?? "" })}>
              <SelectTrigger id="patient">
                <SelectValue placeholder="Select a patient" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id || ""}>
                    {p.firstName} {p.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time *</Label>
              <Input
                id="time"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (mins) *</Label>
              <Input
                id="duration"
                type="number"
                min="15"
                step="15"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v ?? "" })}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial-assessment">Initial Assessment</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="crisis">Crisis Session</SelectItem>
                  <SelectItem value="couples">Couples Session</SelectItem>
                  <SelectItem value="group">Group Session</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes for this appointment..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="h-20"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Creating..." : "Create Appointment"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Appointment Actions Dialog
// ============================================================================

function AppointmentActionsDialog({
  open,
  onOpenChange,
  appointment,
  onActionComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointment: Appointment | null
  onActionComplete: () => void | Promise<void>
}) {
  const { execute: confirmApt, loading: confirmLoading } = useConfirmAppointment()
  const { execute: cancelApt, loading: cancelLoading } = useCancelAppointment()
  const { execute: updateApt, loading: updateLoading } = useUpdateAppointment()
  const [showConfirmCancel, setShowConfirmCancel] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState("")
  const [rescheduleDuration, setRescheduleDuration] = useState(60)
  const [appointmentNotes, setAppointmentNotes] = useState("")
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!appointment) return
    setRescheduleDate(toDatetimeLocalValue(appointment.scheduledAt))
    setRescheduleDuration(appointment.duration || 60)
    setAppointmentNotes(appointment.notes || "")
    setRescheduleError(null)
    setActionError(null)
  }, [appointment])

  if (!appointment) return null

  const isMobileRequest = appointment.source === "mobile"
  const confirmLabel = isMobileRequest ? "Accept Request" : "Confirm Appointment"
  const cancelLabel = isMobileRequest ? "Decline Request" : "Cancel Appointment"
  const confirmingLabel = isMobileRequest ? "Accepting…" : "Confirming…"
  const cancellingLabel = isMobileRequest ? "Declining…" : "Cancelling…"

  const handleConfirm = async () => {
    setActionError(null)
    try {
      await confirmApt(appointment.id || "")
      await onActionComplete()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to confirm appointment:", err)
      setActionError(err instanceof Error ? err.message : "Failed to confirm appointment.")
    }
  }

  const handleCancel = async () => {
    setActionError(null)
    try {
      await cancelApt(appointment.id || "")
      await onActionComplete()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to cancel appointment:", err)
      setActionError(err instanceof Error ? err.message : "Failed to cancel appointment.")
    }
  }

  const handleReschedule = async () => {
    if (!rescheduleDate) {
      setRescheduleError("Choose a date and time.")
      return
    }

    setRescheduleError(null)
    try {
      await updateApt({
        appointmentId: appointment.id || "",
        scheduledAt: new Date(rescheduleDate).toISOString(),
        duration: rescheduleDuration,
        notes: appointmentNotes.trim(),
      })
      await onActionComplete()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to reschedule appointment:", err)
      setRescheduleError("Could not update the appointment time.")
    }
  }

  const canConfirm = appointment.status === "pending"
  const canCancel = ["pending", "confirmed"].includes(appointment.status || "")
  const canReschedule = appointment.status === "confirmed"
  const isCompleted = appointment.status === "completed"
  const isCancelled = appointment.status === "cancelled"

  const formatDateTime = (d?: string | Date) => {
    if (!d) return ""
    const date = new Date(d)
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Appointment Actions
            {isMobileRequest && (
              <Badge
                variant="outline"
                className="border-violet-200 bg-violet-50 text-violet-700 text-xs"
              >
                Patient Request
              </Badge>
            )}
          </DialogTitle>
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Status:</span>
              <StatusBadge status={appointment.status} />
            </div>
            {isMobileRequest && appointment.patientName && (
              <p>
                <span className="font-medium text-foreground">From:</span>{" "}
                {appointment.patientName}
                {appointment.patientEmail && (
                  <span> ({appointment.patientEmail})</span>
                )}
              </p>
            )}
            {appointment.scheduledAt && (
              <p>
                <span className="font-medium text-foreground">Requested for:</span>{" "}
                {formatDateTime(appointment.scheduledAt)}
              </p>
            )}
            {appointment.notes && (
              <p>
                <span className="font-medium text-foreground">Note:</span>{" "}
                {appointment.notes}
              </p>
            )}
            {appointment.sessionSummary && (
              <div className="mt-3 rounded-lg border bg-muted/50 p-3">
                <p className="font-medium text-foreground">AI Generated Summary</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {appointment.sessionSummary}
                </p>
              </div>
            )}
            {appointment.status === "pending" && isMobileRequest && (
              <p className="text-xs">
                Accepting adds this patient to your Patients tab automatically.
              </p>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {appointment.portalPatientId && (
            <Link
              href={`/patients/${appointment.portalPatientId}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              View patient profile
            </Link>
          )}
          {actionError ? <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{actionError}</p> : null}
          {isCompleted && (
            <Alert>
              <CheckCircle className="size-4 text-green-600" />
              <AlertDescription>This appointment has been completed.</AlertDescription>
            </Alert>
          )}

          {isCancelled && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>
                {isMobileRequest
                  ? "This request has been declined."
                  : "This appointment has been cancelled."}
              </AlertDescription>
            </Alert>
          )}

          {canConfirm && (
            <Button onClick={handleConfirm} disabled={confirmLoading} className="w-full">
              <CheckCircle className="size-4 mr-2" />
              {confirmLoading ? confirmingLabel : confirmLabel}
            </Button>
          )}

          {canReschedule && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Reschedule session</p>
              <p className="text-xs text-muted-foreground">
                Changes sync instantly to the patient&apos;s mobile app.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reschedule-at">Date &amp; time</Label>
                <Input
                  id="reschedule-at"
                  type="datetime-local"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-duration">Duration (minutes)</Label>
                <Select
                  value={String(rescheduleDuration)}
                  onValueChange={(value) => setRescheduleDuration(Number(value))}
                >
                  <SelectTrigger id="reschedule-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[30, 45, 60, 90].map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appointment-notes">Appointment notes</Label>
                <Textarea
                  id="appointment-notes"
                  value={appointmentNotes}
                  onChange={(event) => setAppointmentNotes(event.target.value)}
                  placeholder="Add scheduling or session preparation notes..."
                />
              </div>
              {rescheduleError ? (
                <p className="text-xs text-destructive">{rescheduleError}</p>
              ) : null}
              <Button
                onClick={handleReschedule}
                disabled={updateLoading}
                variant="secondary"
                className="w-full"
              >
                {updateLoading ? "Saving…" : "Save new time"}
              </Button>
            </div>
          )}

          {canCancel && (
            <div>
              {!showConfirmCancel ? (
                <Button
                  onClick={() => setShowConfirmCancel(true)}
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                >
                  <XCircle className="size-4 mr-2" />
                  {cancelLabel}
                </Button>
              ) : (
                <div className="space-y-2 rounded-lg bg-destructive/10 p-3">
                  <p className="text-sm font-medium">Are you sure?</p>
                  <p className="text-xs text-muted-foreground">
                    {isMobileRequest
                      ? "The patient will see their request as declined."
                      : "This action cannot be undone. The patient will be notified."}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCancel}
                      disabled={cancelLoading}
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                    >
                      {cancelLoading ? cancellingLabel : `Yes, ${isMobileRequest ? "Decline" : "Cancel"}`}
                    </Button>
                    <Button
                      onClick={() => setShowConfirmCancel(false)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Keep
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function AppointmentsPage() {
  return (
    <ProtectedRoute allowedRoles={["therapist"]} requireVerified>
      <AppointmentsPageContent />
    </ProtectedRoute>
  )
}

function AppointmentsPageContent() {
  const [view, setView] = useState<"list" | "week">("list")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

  const { data: appointments, loading: appointmentsLoading, error: appointmentsError, refetch: refetchAppointments } = useAppointments()
  const { data: patients, loading: patientsLoading, refetch: refetchPatients } = usePatients()

  const appointmentsList = (appointments as Appointment[]) || []
  const patientsList = (patients as Patient[]) || []

  return (
    <PortalShell
      title="Appointment Management"
      subtitle="Schedule, confirm, and manage patient appointments"
    >
      {appointmentsError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="size-4" />
          <AlertDescription>Failed to load appointments. Please try again.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {/* Header with controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              List View
            </button>
            <button
              onClick={() => setView("week")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Week View
            </button>
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="size-4 mr-2" />
                  Schedule Appointment
                </Button>
              }
            />
            <CreateAppointmentDialog
              open={createDialogOpen}
              onOpenChange={setCreateDialogOpen}
              patients={patientsList}
              onCreated={async () => {
                await Promise.all([refetchAppointments(), refetchPatients()])
              }}
            />
          </Dialog>
        </div>

        {/* Main content */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {view === "list" ? (
              <AppointmentListView
                appointments={appointmentsList}
                patients={patientsList}
                loading={appointmentsLoading || patientsLoading}
                onSelectAppointment={(apt) => {
                  setSelectedAppointment(apt)
                  setActionDialogOpen(true)
                }}
              />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <AppointmentWeekView
                    appointments={appointmentsList}
                    patients={patientsList}
                    onSelectAppointment={(apt) => {
                      setSelectedAppointment(apt)
                      setActionDialogOpen(true)
                    }}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar with stats */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Appointment Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-sm text-muted-foreground">Total Appointments</p>
                  <p className="text-2xl font-bold">{appointmentsList.length}</p>
                </div>
                {appointmentsList.filter((a) => a.source === "mobile" && a.status === "pending").length > 0 && (
                  <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
                    <p className="text-sm text-violet-900 font-medium flex items-center gap-1">
                      <AlertCircle className="size-3.5" />
                      Patient Requests:{" "}
                      {appointmentsList.filter((a) => a.source === "mobile" && a.status === "pending").length}
                    </p>
                  </div>
                )}
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                  <p className="text-sm text-yellow-900 font-medium">
                    Pending: {appointmentsList.filter((a) => a.status === "pending").length}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <p className="text-sm text-blue-900 font-medium">
                    Confirmed: {appointmentsList.filter((a) => a.status === "confirmed").length}
                  </p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <p className="text-sm text-green-900 font-medium">
                    Completed: {appointmentsList.filter((a) => a.status === "completed").length}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  Upcoming
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {appointmentsList
                  .filter((a) => a.status === "confirmed")
                  .slice(0, 3)
                  .map((apt) => {
                    const dateStr = new Date(apt.scheduledAt || "").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                    const timeStr = new Date(apt.scheduledAt || "").toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                    return (
                      <div
                        key={apt.id}
                        className="text-xs p-2 rounded bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedAppointment(apt)
                          setActionDialogOpen(true)
                        }}
                      >
                        <p className="font-medium truncate">{dateStr}</p>
                        <p className="text-muted-foreground">{timeStr}</p>
                      </div>
                    )
                  })}
                {appointmentsList.filter((a) => a.status === "confirmed").length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No confirmed appointments
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Appointment Actions Dialog */}
      <AppointmentActionsDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        appointment={selectedAppointment}
        onActionComplete={async () => {
          setSelectedAppointment(null)
          await Promise.all([refetchAppointments(), refetchPatients()])
        }}
      />
    </PortalShell>
  )
}
