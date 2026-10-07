"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PortalShell } from "@/components/portal-shell"
import { ProtectedRoute } from "@/app/protected-route"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RiskBadge } from "@/components/status-badges"
import {
  usePatient,
  useAppointments,
  useMoodEntries,
  useClinicalNotes,
  useCreateMoodEntry,
  useCreateClinicalNote,
  usePatientMobileActivity,
  useLinkPatientFirebaseUid,
  useUnlinkPatientFirebaseUid,
  useDeletePatient,
  useUpdatePatient,
  invalidateQueryCache,
} from "@/lib/hooks"
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  Loader2,
  Plus,
  Smartphone,
  Link2,
  BookOpen,
  Activity,
  Pencil,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

function getPatientStatusLabel(status?: string) {
  switch (status?.toLowerCase()) {
    case "active":
      return "Active"
    case "inactive":
      return "Inactive"
    case "discharged":
      return "Discharged"
    case "pending_intake":
      return "Pending Intake"
    default:
      // Older patient documents may not have a status. Treat that as the
      // model's safe default instead of exposing an unhelpful "Unknown".
      return "Pending Intake"
  }
}

function getPatientDisplayName(patient?: any) {
  const name = `${patient?.firstName || ""} ${patient?.lastName || ""}`.trim()
  return name || patient?.email || "Unnamed patient"
}

function getPatientInitials(patient?: any) {
  const initials = `${patient?.firstName?.charAt(0) || ""}${patient?.lastName?.charAt(0) || ""}`.toUpperCase()
  return initials || "P"
}

function formatPatientDate(value?: string) {
  if (!value) return "Not specified"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not specified" : date.toLocaleDateString()
}

function PatientDetailContent() {
  const params = useParams()
  const router = useRouter()
  const patientId = params.id as string

  const {
    data: patient,
    loading: patientLoading,
    error: patientError,
    refetch: refetchPatient,
  } = usePatient(patientId)

  const {
    data: appointments,
    loading: appointmentsLoading,
  } = useAppointments()

  const {
    data: moodEntries,
    loading: moodLoading,
    refetch: refetchMoodEntries,
  } = useMoodEntries(patientId)

  const {
    data: clinicalNotes,
    loading: notesLoading,
    refetch: refetchClinicalNotes,
  } = useClinicalNotes(patientId)

  const {
    execute: createMoodEntry,
    loading: creatingMood,
  } = useCreateMoodEntry()

  const {
    execute: createNote,
    loading: creatingNote,
  } = useCreateClinicalNote()

  const [mobileActivityRefreshKey, setMobileActivityRefreshKey] = useState(0)

  const {
    data: mobileActivity,
    loading: mobileActivityLoading,
    error: mobileActivityError,
  } = usePatientMobileActivity(
    patientId,
    30,
    mobileActivityRefreshKey,
  )

  const {
    execute: linkFirebaseUid,
    loading: linking,
  } = useLinkPatientFirebaseUid()

  const {
    execute: unlinkFirebaseUid,
    loading: unlinking,
  } = useUnlinkPatientFirebaseUid()

  const {
    execute: deletePatient,
    loading: deleting,
  } = useDeletePatient()

  const {
    execute: updatePatient,
    loading: updatingPatient,
  } = useUpdatePatient()

  const [moodForm, setMoodForm] = useState({
    moodScore: 5,
    description: "",
  })

  const [noteForm, setNoteForm] = useState({
    content: "",
    tags: "",
    isConfidential: false,
  })

  const [isMoodOpen, setIsMoodOpen] = useState(false)
  const [isNoteOpen, setIsNoteOpen] = useState(false)
  const [isLinkOpen, setIsLinkOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    status: "pending_intake",
    riskLevel: "low",
    clinicalNotes: "",
  })
  const [firebaseUidInput, setFirebaseUidInput] = useState("")
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!patient) return
    setEditForm({
      firstName: patient.firstName || "",
      lastName: patient.lastName || "",
      email: patient.email || "",
      phone: patient.phone || patient.phoneNumber || "",
      status: patient.status || "pending_intake",
      riskLevel: patient.riskLevel || "low",
      clinicalNotes: patient.clinicalNotes || "",
    })
  }, [patient])

  async function handleUpdatePatient(event: React.FormEvent) {
    event.preventDefault()
    setEditError(null)
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.email.trim()) {
      setEditError("First name, last name, and email are required.")
      return
    }
    try {
      await updatePatient({
        patientId,
        ...editForm,
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        clinicalNotes: editForm.clinicalNotes.trim(),
      })
      invalidateQueryCache("patients")
      invalidateQueryCache("patient", [patientId])
      await refetchPatient()
      setIsEditOpen(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update patient.")
    }
  }

  const handleRemovePatient = async () => {
    if (
      !window.confirm(
        "Remove this patient from your patient list? Their historical records will be preserved.",
      )
    ) {
      return
    }

    try {
      await deletePatient(patientId)

      invalidateQueryCache("patients")
      invalidateQueryCache("patient", [patientId])

      router.push("/patients")
    } catch (err) {
      console.error("Failed to remove patient:", err)
    }
  }

  if (patientError) {
    return (
      <PortalShell
        title="Patient not found"
        subtitle="Unable to load this patient"
      >
        <Link
          href="/patients"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to directory
        </Link>

        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" />
          <span>{patientError.message}</span>
        </div>
      </PortalShell>
    )
  }

  /*
   * Resolve this patient's appointments.
   *
   * Different appointment records may identify the patient using:
   * - portal patient ID
   * - portalPatientId
   * - Firebase/mobile UID
   *
   * We support all three so the profile does not incorrectly show
   * "Pending" when the appointment is actually confirmed/completed.
   */
  const patientAppointments = (appointments || []).filter(
    (apt: any) =>
      apt.patientId === patientId ||
      apt.portalPatientId === patientId ||
      apt.patientId === patient?.firebaseUid,
  )

  const handleCreateMoodEntry = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!moodForm.description.trim()) {
      return
    }

    await createMoodEntry({
      patientId,
      moodScore: moodForm.moodScore,
      description: moodForm.description,
    })

    await refetchMoodEntries()

    setMoodForm({
      moodScore: 5,
      description: "",
    })

    setIsMoodOpen(false)
  }

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!noteForm.content.trim()) {
      return
    }

    await createNote({
      patientId,
      content: noteForm.content,
      tags: noteForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      isConfidential: noteForm.isConfidential,
    })

    await refetchClinicalNotes()

    setNoteForm({
      content: "",
      tags: "",
      isConfidential: false,
    })

    setIsNoteOpen(false)
  }

  const handleLinkFirebaseUid = async (e: React.FormEvent) => {
    e.preventDefault()
    setLinkError(null)

    const uid = firebaseUidInput.trim()

    if (!uid) {
      setLinkError("Please enter the patient's Firebase UID.")
      return
    }

    try {
      await linkFirebaseUid({
        patientId,
        firebaseUid: uid,
      })

      setFirebaseUidInput("")
      setIsLinkOpen(false)
      setMobileActivityRefreshKey((key) => key + 1)
    } catch (err: any) {
      setLinkError(err?.message || "Failed to link account.")
    }
  }

  const handleUnlinkFirebaseUid = async () => {
    setLinkError(null)

    try {
      await unlinkFirebaseUid(patientId)
      setMobileActivityRefreshKey((key) => key + 1)
    } catch (err: any) {
      setLinkError(err?.message || "Failed to unlink account.")
    }
  }

  const LoadingSkeleton = () => (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )

  return (
    <PortalShell
      title={
        patientLoading
          ? "Loading..."
          : getPatientDisplayName(patient)
      }
      subtitle={
        patientLoading
          ? "Loading patient information..."
          : `${getPatientStatusLabel(patient?.status)} · Member since ${formatPatientDate(patient?.createdAt)}`
      }
    >
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-muted-foreground"
        onClick={() => window.history.back()}
      >
        <ArrowLeft className="size-4" />
        Back to directory
      </Button>

      {patientError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" />
          <span>Failed to load patient information</span>
        </div>
      )}

      {patientLoading ? (
        <Card className="p-5">
          <LoadingSkeleton />
        </Card>
      ) : patient ? (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <Avatar className="size-16">
                  <AvatarImage
                    src={patient.profilePhoto || ""}
                    alt={getPatientDisplayName(patient)}
                  />

                  <AvatarFallback>
                    {getPatientInitials(patient)}
                  </AvatarFallback>
                </Avatar>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-foreground">
                      {getPatientDisplayName(patient)}
                    </h2>

                    <RiskBadge
                      level={patient.riskLevel || "low"}
                    />
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {patient.email || "Email not provided"}
                    </div>

                    {(patient.phone || patient.phoneNumber) && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {patient.phone || patient.phoneNumber}
                      </div>
                    )}

                    {patient.dateOfBirth && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        DOB:{" "}
                        {formatPatientDate(patient.dateOfBirth)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                  <DialogTrigger render={<Button variant="outline"><Pencil className="size-4" />Edit</Button>} />
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Patient</DialogTitle>
                      <DialogDescription>Update contact and clinical status information.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleUpdatePatient}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5"><Label htmlFor="edit-first-name">First Name</Label><Input id="edit-first-name" required value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label htmlFor="edit-last-name">Last Name</Label><Input id="edit-last-name" required value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} /></div>
                      </div>
                      <div className="space-y-1.5"><Label htmlFor="edit-email">Email</Label><Input id="edit-email" type="email" required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label htmlFor="edit-phone">Phone</Label><Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5"><Label htmlFor="edit-status">Status</Label><select id="edit-status" className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}><option value="pending_intake">Pending Intake</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="discharged">Discharged</option></select></div>
                        <div className="space-y-1.5"><Label htmlFor="edit-risk">Risk Level</Label><select id="edit-risk" className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={editForm.riskLevel} onChange={(e) => setEditForm({ ...editForm, riskLevel: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                      </div>
                      <div className="space-y-1.5"><Label htmlFor="edit-clinical-notes">Profile Notes</Label><Textarea id="edit-clinical-notes" value={editForm.clinicalNotes} onChange={(e) => setEditForm({ ...editForm, clinicalNotes: e.target.value })} /></div>
                      {editError ? <p className="text-sm text-destructive">{editError}</p> : null}
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button><Button type="submit" disabled={updatingPatient}>{updatingPatient ? "Saving..." : "Save patient"}</Button></div>
                    </form>
                  </DialogContent>
                </Dialog>
                <Link href="/appointments">
                  <Button>Schedule</Button>
                </Link>

                <Button
                  variant="outline"
                  onClick={handleRemovePatient}
                  disabled={deleting}
                >
                  {deleting
                    ? "Removing..."
                    : "Remove patient"}
                </Button>
              </div>
            </div>
          </Card>

          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="overview">
                Overview
              </TabsTrigger>

              <TabsTrigger value="appointments">
                Appointments
              </TabsTrigger>

              <TabsTrigger value="mood">
                Mood Entries
              </TabsTrigger>

              <TabsTrigger value="notes">
                Clinical Notes
              </TabsTrigger>

              <TabsTrigger
                value="mobile"
                className="flex items-center gap-1"
              >
                <Smartphone className="h-3.5 w-3.5" />
                Mobile Activity
              </TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent
              value="overview"
              className="mt-4 space-y-4"
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Status
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {getPatientStatusLabel(
                        patient.status,
                      )}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Risk Level
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <p className="text-2xl font-semibold capitalize">
                      {patient.riskLevel || "low"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Total Sessions
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {
                        patientAppointments.filter(
                          (a: any) =>
                            a.status === "completed",
                        ).length
                      }
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>

                <CardContent>
                  <p className="text-muted-foreground">
                    {patient.clinicalNotes ||
                      "No additional notes on file"}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Appointments */}
            <TabsContent
              value="appointments"
              className="mt-4 space-y-4"
            >
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Appointments</CardTitle>

                  <Link href="/appointments">
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      New
                    </Button>
                  </Link>
                </CardHeader>

                <CardContent>
                  {appointmentsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map(
                        (_, i) => (
                          <Skeleton
                            key={i}
                            className="h-12 w-full"
                          />
                        ),
                      )}
                    </div>
                  ) : patientAppointments.length ===
                    0 ? (
                    <p className="text-sm text-muted-foreground">
                      No appointments yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {patientAppointments
                        .slice(0, 10)
                        .map((apt: any) => (
                          <div
                            key={apt.id}
                            className="flex items-center justify-between rounded-lg border p-3"
                          >
                            <div>
                              <p className="font-medium text-sm">
                                {new Date(
                                  apt.scheduledAt,
                                ).toLocaleDateString()}{" "}
                                at{" "}
                                {new Date(
                                  apt.scheduledAt,
                                ).toLocaleTimeString(
                                  "en-US",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {apt.type ||
                                  "Therapy Session"}{" "}
                                ·{" "}
                                {apt.duration || 60}
                                min
                              </p>
                            </div>

                            <div>
                              <span className="text-xs font-medium rounded px-2 py-1 bg-blue-100 text-blue-700">
                                {apt.status}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Mood Entries */}
            <TabsContent
              value="mood"
              className="mt-4 space-y-4"
            >
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Mood Entries</CardTitle>

                  <Dialog
                    open={isMoodOpen}
                    onOpenChange={setIsMoodOpen}
                  >
                    <DialogTrigger
                      render={
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-1" />
                          Add Entry
                        </Button>
                      }
                    />

                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Log Mood Entry
                        </DialogTitle>

                        <DialogDescription>
                          Record the patient's current mood
                          and observations
                        </DialogDescription>
                      </DialogHeader>

                      <form
                        onSubmit={handleCreateMoodEntry}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="mood-score">
                            Mood Score (1-10):{" "}
                            {moodForm.moodScore}
                          </Label>

                          <Input
                            id="mood-score"
                            type="range"
                            min="1"
                            max="10"
                            value={moodForm.moodScore}
                            onChange={(e) =>
                              setMoodForm({
                                ...moodForm,
                                moodScore: parseInt(
                                  e.target.value,
                                ),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="description">
                            Notes
                          </Label>

                          <Textarea
                            id="description"
                            placeholder="Observations about mood, triggers, or context..."
                            value={
                              moodForm.description
                            }
                            onChange={(e) =>
                              setMoodForm({
                                ...moodForm,
                                description:
                                  e.target.value,
                              })
                            }
                            required
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={
                            creatingMood ||
                            !moodForm.description.trim()
                          }
                          className="w-full"
                        >
                          {creatingMood ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            "Create Entry"
                          )}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>

                <CardContent>
                  {moodLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map(
                        (_, i) => (
                          <Skeleton
                            key={i}
                            className="h-16 w-full"
                          />
                        ),
                      )}
                    </div>
                  ) : !moodEntries ||
                    moodEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No mood entries yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {moodEntries
                        .slice(0, 10)
                        .map((entry: any) => (
                          <div
                            key={entry.id}
                            className="rounded-lg border p-3"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">
                                    Mood Score:{" "}
                                    {entry.moodScore}/10
                                  </p>

                                  {entry.riskLevel && (
                                    <RiskBadge
                                      level={
                                        entry.riskLevel
                                      }
                                    />
                                  )}
                                </div>

                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(
                                    entry.createdAt,
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            {entry.description && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {entry.description}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Clinical Notes */}
            <TabsContent
              value="notes"
              className="mt-4 space-y-4"
            >
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Clinical Notes</CardTitle>

                  <Dialog
                    open={isNoteOpen}
                    onOpenChange={setIsNoteOpen}
                  >
                    <DialogTrigger
                      render={
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-1" />
                          Add Note
                        </Button>
                      }
                    />

                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Create Clinical Note
                        </DialogTitle>

                        <DialogDescription>
                          Document clinical observations and
                          treatment notes
                        </DialogDescription>
                      </DialogHeader>

                      <form
                        onSubmit={handleCreateNote}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="content">
                            Note Content
                          </Label>

                          <Textarea
                            id="content"
                            placeholder="Clinical observations, session summary, treatment plan updates..."
                            value={noteForm.content}
                            onChange={(e) =>
                              setNoteForm({
                                ...noteForm,
                                content: e.target.value,
                              })
                            }
                            required
                            className="min-h-32"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="tags">
                            Tags (comma-separated)
                          </Label>

                          <Input
                            id="tags"
                            placeholder="e.g., therapy, follow-up, medication"
                            value={noteForm.tags}
                            onChange={(e) =>
                              setNoteForm({
                                ...noteForm,
                                tags: e.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="confidential"
                            checked={
                              noteForm.isConfidential
                            }
                            onChange={(e) =>
                              setNoteForm({
                                ...noteForm,
                                isConfidential:
                                  e.target.checked,
                              })
                            }
                          />

                          <Label
                            htmlFor="confidential"
                            className="text-sm"
                          >
                            Mark as confidential
                          </Label>
                        </div>

                        <Button
                          type="submit"
                          disabled={
                            creatingNote ||
                            !noteForm.content.trim()
                          }
                          className="w-full"
                        >
                          {creatingNote ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            "Create Note"
                          )}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>

                <CardContent>
                  {notesLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map(
                        (_, i) => (
                          <Skeleton
                            key={i}
                            className="h-20 w-full"
                          />
                        ),
                      )}
                    </div>
                  ) : !clinicalNotes ||
                    clinicalNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No clinical notes yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {clinicalNotes
                        .slice(0, 10)
                        .map((note: any) => (
                          <div
                            key={note.id}
                            className="rounded-lg border p-3"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(
                                    note.createdAt,
                                  ).toLocaleDateString()}
                                </p>

                                {note.tags &&
                                  note.tags.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {note.tags.map(
                                        (
                                          tag: string,
                                          i: number,
                                        ) => (
                                          <span
                                            key={i}
                                            className="text-xs rounded bg-blue-100 px-2 py-1 text-blue-700"
                                          >
                                            {tag}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  )}
                              </div>

                              {note.isConfidential && (
                                <span className="text-xs font-medium rounded px-2 py-1 bg-red-100 text-red-700 ml-2">
                                  Confidential
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-foreground mt-2">
                              {note.content}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Mobile Activity */}
            <TabsContent
              value="mobile"
              className="mt-4 space-y-4"
            >
              {/* Link / unlink mobile account */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Mobile App Account
                    </CardTitle>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Link this patient's moodie mobile account
                      to see their self-reported mood check-ins
                      and journal entries.
                    </p>
                  </div>

                  {!mobileActivity?.linked ? (
                    <Dialog
                      open={isLinkOpen}
                      onOpenChange={setIsLinkOpen}
                    >
                      <DialogTrigger
                        render={
                          <Button
                            size="sm"
                            variant="outline"
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            Link Account
                          </Button>
                        }
                      />

                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            Link Patient's Mobile Account
                          </DialogTitle>

                          <DialogDescription>
                            Paste the Firebase UID from the
                            patient's moodie mobile app account
                            — not the therapist account. Find it
                            in Firebase Console →
                            Authentication → Users, matching
                            the patient's login email.
                          </DialogDescription>
                        </DialogHeader>

                        <form
                          onSubmit={handleLinkFirebaseUid}
                          className="space-y-4"
                        >
                          <div className="space-y-2">
                            <Label htmlFor="firebase-uid">
                              Patient Firebase UID
                            </Label>

                            <Input
                              id="firebase-uid"
                              placeholder="e.g. abc123def456..."
                              value={firebaseUidInput}
                              onChange={(e) =>
                                setFirebaseUidInput(
                                  e.target.value,
                                )
                              }
                              required
                            />
                          </div>

                          {linkError && (
                            <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                              {linkError}
                            </div>
                          )}

                          <Button
                            type="submit"
                            disabled={
                              linking ||
                              !firebaseUidInput.trim()
                            }
                            className="w-full"
                          >
                            {linking ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Linking...
                              </>
                            ) : (
                              "Link Account"
                            )}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Linked
                      </div>

                      <Dialog
                        open={isLinkOpen}
                        onOpenChange={setIsLinkOpen}
                      >
                        <DialogTrigger
                          render={
                            <Button
                              size="sm"
                              variant="outline"
                            >
                              Change UID
                            </Button>
                          }
                        />

                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              Change Linked Mobile Account
                            </DialogTitle>

                            <DialogDescription>
                              Enter the correct Firebase UID for
                              this patient's mobile app login.
                            </DialogDescription>
                          </DialogHeader>

                          <form
                            onSubmit={handleLinkFirebaseUid}
                            className="space-y-4"
                          >
                            <div className="space-y-2">
                              <Label htmlFor="firebase-uid-change">
                                Patient Firebase UID
                              </Label>

                              <Input
                                id="firebase-uid-change"
                                placeholder="Paste the patient's mobile app UID"
                                value={firebaseUidInput}
                                onChange={(e) =>
                                  setFirebaseUidInput(
                                    e.target.value,
                                  )
                                }
                                required
                              />
                            </div>

                            {linkError && (
                              <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                {linkError}
                              </div>
                            )}

                            <Button
                              type="submit"
                              disabled={
                                linking ||
                                !firebaseUidInput.trim()
                              }
                              className="w-full"
                            >
                              {linking
                                ? "Updating..."
                                : "Update Link"}
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>

                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={unlinking}
                        onClick={handleUnlinkFirebaseUid}
                      >
                        {unlinking
                          ? "Unlinking..."
                          : "Unlink"}
                      </Button>
                    </div>
                  )}
                </CardHeader>

                {mobileActivity?.linked && (
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        {mobileActivity.firebaseUid}
                      </code>
                    </p>

                    {mobileActivity.mobileUserFound ? (
                      <p className="text-xs text-muted-foreground">
                        Mobile account linked
                      </p>
                    ) : (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                        <span>
                          No mobile app profile found for this
                          UID. You may have linked the wrong
                          account — use{" "}
                          <strong>Change UID</strong> and paste
                          the UID from the patient's mobile login
                          in Firebase Authentication.
                        </span>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Error state */}
              {mobileActivityError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  Failed to load mobile activity. Please try
                  refreshing.
                </div>
              )}

              {/* Not linked state */}
              {!mobileActivityLoading &&
                !mobileActivityError &&
                !mobileActivity?.linked && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Smartphone className="h-10 w-10 text-muted-foreground/40 mb-3" />

                      <p className="font-medium text-sm text-muted-foreground">
                        No mobile account linked
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                        Link the patient's moodie app account
                        above to view their self-reported
                        check-ins and journal entries here.
                      </p>
                    </CardContent>
                  </Card>
                )}

              {/* Mood Check-ins */}
              {(mobileActivity?.linked ||
                mobileActivityLoading) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4" />
                      Mood Check-ins

                      {!mobileActivityLoading &&
                        mobileActivity?.moodCheckins && (
                          <span className="ml-auto text-xs font-normal text-muted-foreground">
                            {mobileActivity.moodCheckins.length}{" "}
                            record
                            {mobileActivity.moodCheckins.length !==
                            1
                              ? "s"
                              : ""}
                          </span>
                        )}
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    {mobileActivityLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map(
                          (_, i) => (
                            <Skeleton
                              key={i}
                              className="h-16 w-full"
                            />
                          ),
                        )}
                      </div>
                    ) : !mobileActivity?.moodCheckins ||
                      mobileActivity.moodCheckins.length ===
                        0 ? (
                      <p className="text-sm text-muted-foreground">
                        No mood check-ins recorded yet from the
                        mobile app.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {mobileActivity.moodCheckins.map(
                          (checkin: any) => (
                            <div
                              key={checkin.id}
                              className="rounded-lg border p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap gap-1.5">
                                  {(
                                    checkin.moods as string[]
                                  ).map(
                                    (
                                      mood: string,
                                      i: number,
                                    ) => (
                                      <span
                                        key={i}
                                        className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700"
                                      >
                                        {mood}
                                      </span>
                                    ),
                                  )}
                                </div>

                                <span className="flex-shrink-0 text-xs text-muted-foreground">
                                  {checkin.timestamp
                                    ? new Date(
                                        checkin.timestamp,
                                      ).toLocaleDateString(
                                        "en-US",
                                        {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        },
                                      )
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Journal Entries */}
              {(mobileActivity?.linked ||
                mobileActivityLoading) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BookOpen className="h-4 w-4" />
                      Journal Entries

                      {!mobileActivityLoading &&
                        mobileActivity?.journalEntries && (
                          <span className="ml-auto text-xs font-normal text-muted-foreground">
                            {mobileActivity.journalEntries.length}{" "}
                            record
                            {mobileActivity.journalEntries.length !==
                            1
                              ? "s"
                              : ""}
                          </span>
                        )}
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    {mobileActivityLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map(
                          (_, i) => (
                            <Skeleton
                              key={i}
                              className="h-24 w-full"
                            />
                          ),
                        )}
                      </div>
                    ) : !mobileActivity?.journalEntries ||
                      mobileActivity.journalEntries.length ===
                        0 ? (
                      <p className="text-sm text-muted-foreground">
                        No journal entries recorded yet from the
                        mobile app.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {mobileActivity.journalEntries.map(
                          (entry: any) => (
                            <div
                              key={entry.id}
                              className="rounded-lg border p-3"
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                {entry.prompt ? (
                                  <p className="text-xs font-medium text-muted-foreground italic">
                                    Prompt: {entry.prompt}
                                  </p>
                                ) : (
                                  <p className="text-xs font-medium text-muted-foreground italic">
                                    Free-write entry
                                  </p>
                                )}

                                <span className="flex-shrink-0 text-xs text-muted-foreground">
                                  {entry.timestamp
                                    ? new Date(
                                        entry.timestamp,
                                      ).toLocaleDateString(
                                        "en-US",
                                        {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        },
                                      )
                                    : "—"}
                                </span>
                              </div>

                              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                                {entry.entry}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </PortalShell>
  )
}

export default function PatientDetailPage() {
  return (
    <ProtectedRoute allowedRoles={["therapist"]} requireVerified>
      <PatientDetailContent />
    </ProtectedRoute>
  )
}
