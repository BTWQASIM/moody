"use client"

import { notFound } from "next/navigation"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
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
} from "@/lib/hooks"
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  Loader2,
  Plus,
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

function PatientDetailContent() {
  const params = useParams()
  const patientId = params.id as string

  const { data: patient, loading: patientLoading, error: patientError } = usePatient(patientId)
  const { data: appointments, loading: appointmentsLoading } = useAppointments()
  const { data: moodEntries, loading: moodLoading } = useMoodEntries(patientId)
  const { data: clinicalNotes, loading: notesLoading } = useClinicalNotes(patientId)
  const { execute: createMoodEntry, loading: creatingMood } = useCreateMoodEntry()
  const { execute: createNote, loading: creatingNote } = useCreateClinicalNote()

  const [moodForm, setMoodForm] = useState({ moodScore: 5, description: "" })
  const [noteForm, setNoteForm] = useState({ content: "", tags: "", isConfidential: false })
  const [isMoodOpen, setIsMoodOpen] = useState(false)
  const [isNoteOpen, setIsNoteOpen] = useState(false)

  if (patientError) {
    notFound()
  }

  const patientAppointments = (appointments || []).filter(
    (apt: any) => apt.patientId === patientId
  )

  const handleCreateMoodEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!moodForm.description.trim()) return

    await createMoodEntry({
      patientId,
      moodScore: moodForm.moodScore,
      description: moodForm.description,
    })

    setMoodForm({ moodScore: 5, description: "" })
    setIsMoodOpen(false)
  }

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteForm.content.trim()) return

    await createNote({
      patientId,
      content: noteForm.content,
      tags: noteForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      isConfidential: noteForm.isConfidential,
    })

    setNoteForm({ content: "", tags: "", isConfidential: false })
    setIsNoteOpen(false)
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
        patientLoading ? "Loading..." : `${patient?.firstName} ${patient?.lastName}`
      }
      subtitle={
        patientLoading
          ? "Loading patient information..."
          : `${patient?.status || "active"} · Member since ${
              patient?.createdAt
                ? new Date(patient.createdAt).toLocaleDateString()
                : "N/A"
            }`
      }
    >
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground" onClick={() => window.history.back()}>
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
                    src={patient.profilePhoto || "/placeholder.svg"}
                    alt={`${patient.firstName} ${patient.lastName}`}
                  />
                  <AvatarFallback>{patient.firstName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-foreground">
                      {`${patient.firstName} ${patient.lastName}`}
                    </h2>
                    <RiskBadge level={patient.riskLevel || "low"} />
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {patient.email}
                    </div>
                    {patient.phoneNumber && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {patient.phoneNumber}
                      </div>
                    )}
                    {patient.dateOfBirth && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        DOB: {new Date(patient.dateOfBirth).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/messages">
                  <Button variant="outline">Message</Button>
                </Link>
                <Link href="/appointments">
                  <Button>Schedule</Button>
                </Link>
              </div>
            </div>
          </Card>

          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
              <TabsTrigger value="mood">Mood Entries</TabsTrigger>
              <TabsTrigger value="notes">Clinical Notes</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold capitalize">{patient.status}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Risk Level</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold capitalize">
                      {patient.riskLevel || "low"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Total Sessions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {patientAppointments.filter((a: any) => a.status === "completed").length}
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
                    {patient.notes ||
                      "No additional notes on file"}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Appointments */}
            <TabsContent value="appointments" className="mt-4 space-y-4">
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
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : patientAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No appointments yet</p>
                  ) : (
                    <div className="space-y-2">
                      {patientAppointments.slice(0, 10).map((apt: any) => (
                        <div
                          key={apt.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div>
                            <p className="font-medium text-sm">
                              {new Date(apt.scheduledAt).toLocaleDateString()}{" "}
                              at{" "}
                              {new Date(apt.scheduledAt).toLocaleTimeString(
                                "en-US",
                                { hour: "2-digit", minute: "2-digit" }
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {apt.type || "Therapy Session"} · {apt.duration || 60}min
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
            <TabsContent value="mood" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Mood Entries</CardTitle>
                  <Dialog open={isMoodOpen} onOpenChange={setIsMoodOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Entry
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Log Mood Entry</DialogTitle>
                        <DialogDescription>
                          Record the patient's current mood and observations
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateMoodEntry} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="mood-score">
                            Mood Score (1-10): {moodForm.moodScore}
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
                                moodScore: parseInt(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="description">Notes</Label>
                          <Textarea
                            id="description"
                            placeholder="Observations about mood, triggers, or context..."
                            value={moodForm.description}
                            onChange={(e) =>
                              setMoodForm({
                                ...moodForm,
                                description: e.target.value,
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
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : !moodEntries || moodEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No mood entries yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {moodEntries.slice(0, 10).map((entry: any) => (
                        <div
                          key={entry.id}
                          className="rounded-lg border p-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">
                                  Mood Score: {entry.moodScore}/10
                                </p>
                                {entry.riskLevel && (
                                  <RiskBadge level={entry.riskLevel} />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(entry.createdAt).toLocaleDateString()}
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
            <TabsContent value="notes" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Clinical Notes</CardTitle>
                  <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Note
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Clinical Note</DialogTitle>
                        <DialogDescription>
                          Document clinical observations and treatment notes
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateNote} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="content">Note Content</Label>
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
                          <Label htmlFor="tags">Tags (comma-separated)</Label>
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
                            checked={noteForm.isConfidential}
                            onChange={(e) =>
                              setNoteForm({
                                ...noteForm,
                                isConfidential: e.target.checked,
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
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : !clinicalNotes || clinicalNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No clinical notes yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {clinicalNotes.slice(0, 10).map((note: any) => (
                        <div
                          key={note.id}
                          className="rounded-lg border p-3"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground">
                                {new Date(note.createdAt).toLocaleDateString()}
                              </p>
                              {note.tags && note.tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {note.tags.map((tag: string, i: number) => (
                                    <span
                                      key={i}
                                      className="text-xs rounded bg-blue-100 px-2 py-1 text-blue-700"
                                    >
                                      {tag}
                                    </span>
                                  ))}
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
          </Tabs>
        </>
      ) : null}
    </PortalShell>
  )
}

export default function PatientDetailPage() {
  return (
    <ProtectedRoute>
      <PatientDetailContent />
    </ProtectedRoute>
  )
}
