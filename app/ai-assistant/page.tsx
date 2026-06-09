"use client"

import { useState } from "react"
import { PortalShell } from "@/components/portal-shell"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  usePatients,
  useAppointments,
  useSummarizeNotes,
  useAnalyzeMood,
  useGenerateClinicalNotes,
  useAssessRisk,
  useExtractActionItems,
  useGenerateProgressReport,
  useTaskStatus,
  useMoodEntries,
} from "@/lib/hooks"
import {
  Sparkles,
  Zap,
  Brain,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Copy,
  Download,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// ============================================================================
// Type Definitions
// ============================================================================

interface Patient {
  id?: string
  firstName?: string
  lastName?: string
  email?: string
}

interface Appointment {
  id?: string
  patientId?: string
  scheduledAt?: string
  type?: string
}

interface MoodEntry {
  id?: string
  patientId?: string
  score?: number
  notes?: string
  createdAt?: string
}

interface TaskResult {
  taskId?: string
  status?: string
  result?: Record<string, any>
  error?: string
  progress?: number
}

// ============================================================================
// Task Status Indicator
// ============================================================================

function TaskStatusIndicator({ status }: { status?: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: "Pending", color: "text-yellow-600", icon: <Clock className="size-4" /> },
    started: { label: "Processing", color: "text-blue-600", icon: <Loader2 className="size-4 animate-spin" /> },
    completed: { label: "Completed", color: "text-green-600", icon: <CheckCircle className="size-4" /> },
    failed: { label: "Failed", color: "text-red-600", icon: <AlertTriangle className="size-4" /> },
  }

  const s = config[status || "pending"]
  return (
    <div className="flex items-center gap-2">
      <span className={s.color}>{s.icon}</span>
      <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
    </div>
  )
}

// ============================================================================
// Summarize Notes Tab
// ============================================================================

function SummarizeNotesTab({ appointments, patients }: { appointments: Appointment[]; patients: Patient[] }) {
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("")
  const [content, setContent] = useState("")
  const [taskId, setTaskId] = useState<string | null>(null)

  const { execute, loading } = useSummarizeNotes()
  const { data: taskResult } = useTaskStatus(taskId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAppointmentId || !content.trim()) {
      alert("Please select an appointment and enter content")
      return
    }

    try {
      const result: any = await execute({
        appointmentId: selectedAppointmentId,
        content,
      })
      setTaskId(result.taskId)
      setContent("")
    } catch (err) {
      console.error("Failed to submit summarization task:", err)
    }
  }

  const getPatientName = (patientId?: string) => {
    const patient = patients.find((p) => p.id === patientId)
    return patient ? `${patient.firstName} ${patient.lastName}` : "Unknown"
  }

  const appointmentOptions = appointments.map((apt) => ({
    id: apt.id,
    label: `${getPatientName(apt.patientId)} - ${apt.type || "Session"}`,
    date: new Date(apt.scheduledAt || "").toLocaleDateString(),
  }))

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="appointment">Select Appointment *</Label>
          <Select value={selectedAppointmentId} onValueChange={setSelectedAppointmentId}>
            <SelectTrigger id="appointment">
              <SelectValue placeholder="Choose an appointment..." />
            </SelectTrigger>
            <SelectContent>
              {appointmentOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id || ""}>
                  {opt.label} ({opt.date})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Session Notes/Transcript *</Label>
          <Textarea
            id="content"
            placeholder="Paste session notes, transcript, or key points..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-32 resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {content.length} characters • AI will analyze and create a summary
          </p>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Zap className="size-4 mr-2" />
              Summarize Notes
            </>
          )}
        </Button>
      </form>

      {taskId && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Task Status</span>
              <TaskStatusIndicator status={(taskResult as any)?.status} />
            </div>
            {(taskResult as any)?.result && (
              <div className="rounded-lg bg-background p-4 text-sm space-y-2 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {JSON.stringify((taskResult as any).result, null, 2)}
                </pre>
              </div>
            )}
            {(taskResult as any)?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{(taskResult as any).error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Analyze Mood Tab
// ============================================================================

function AnalyzeMoodTab({ patients, moodEntries }: { patients: Patient[]; moodEntries: MoodEntry[] }) {
  const [selectedMoodEntryId, setSelectedMoodEntryId] = useState("")
  const [moodDescription, setMoodDescription] = useState("")
  const [taskId, setTaskId] = useState<string | null>(null)

  const { execute, loading } = useAnalyzeMood()
  const { data: taskResult } = useTaskStatus(taskId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMoodEntryId || !moodDescription.trim()) {
      alert("Please select a mood entry and provide description")
      return
    }

    try {
      const result: any = await execute({
        moodEntryId: selectedMoodEntryId,
        moodDescription,
      })
      setTaskId(result.taskId)
      setMoodDescription("")
    } catch (err) {
      console.error("Failed to submit mood analysis:", err)
    }
  }

  const getPatientName = (patientId?: string) => {
    const patient = patients.find((p) => p.id === patientId)
    return patient ? `${patient.firstName} ${patient.lastName}` : "Unknown"
  }

  const moodOptions = moodEntries.map((entry) => ({
    id: entry.id,
    label: `${getPatientName(entry.patientId)} - Score: ${entry.score}/10`,
    date: new Date(entry.createdAt || "").toLocaleDateString(),
  }))

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mood-entry">Select Mood Entry *</Label>
          <Select value={selectedMoodEntryId} onValueChange={setSelectedMoodEntryId}>
            <SelectTrigger id="mood-entry">
              <SelectValue placeholder="Choose a mood entry..." />
            </SelectTrigger>
            <SelectContent>
              {moodOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id || ""}>
                  {opt.label} ({opt.date})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mood-description">Mood Context/Description *</Label>
          <Textarea
            id="mood-description"
            placeholder="Describe the patient's emotional state, triggers, and context..."
            value={moodDescription}
            onChange={(e) => setMoodDescription(e.target.value)}
            className="h-32 resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {moodDescription.length} characters • AI will analyze patterns and provide insights
          </p>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Brain className="size-4 mr-2" />
              Analyze Mood Pattern
            </>
          )}
        </Button>
      </form>

      {taskId && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Analysis Status</span>
              <TaskStatusIndicator status={(taskResult as any)?.status} />
            </div>
            {(taskResult as any)?.result && (
              <div className="rounded-lg bg-background p-4 text-sm space-y-2 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {JSON.stringify((taskResult as any).result, null, 2)}
                </pre>
              </div>
            )}
            {(taskResult as any)?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{(taskResult as any).error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Generate Clinical Notes Tab
// ============================================================================

function GenerateClinicalNotesTab({ appointments, patients }: { appointments: Appointment[]; patients: Patient[] }) {
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("")
  const [transcript, setTranscript] = useState("")
  const [taskId, setTaskId] = useState<string | null>(null)

  const { execute, loading } = useGenerateClinicalNotes()
  const { data: taskResult } = useTaskStatus(taskId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAppointmentId || !transcript.trim()) {
      alert("Please select an appointment and enter transcript")
      return
    }

    const appointment = appointments.find((a) => a.id === selectedAppointmentId)
    const patient = patients.find((p) => p.id === appointment?.patientId)
    if (!appointment || !patient) {
      alert("Invalid appointment or patient data")
      return
    }

    try {
      const result: any = await execute({
        appointmentId: selectedAppointmentId,
        transcript,
        patientName: `${patient.firstName} ${patient.lastName}`,
        sessionDate: new Date(appointment.scheduledAt || "").toISOString().split("T")[0],
      })
      setTaskId(result.taskId)
      setTranscript("")
    } catch (err) {
      console.error("Failed to generate clinical notes:", err)
    }
  }

  const getPatientName = (patientId?: string) => {
    const patient = patients.find((p) => p.id === patientId)
    return patient ? `${patient.firstName} ${patient.lastName}` : "Unknown"
  }

  const appointmentOptions = appointments.map((apt) => ({
    id: apt.id,
    label: `${getPatientName(apt.patientId)} - ${apt.type || "Session"}`,
    date: new Date(apt.scheduledAt || "").toLocaleDateString(),
  }))

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="apt-select">Select Appointment *</Label>
          <Select value={selectedAppointmentId} onValueChange={setSelectedAppointmentId}>
            <SelectTrigger id="apt-select">
              <SelectValue placeholder="Choose an appointment..." />
            </SelectTrigger>
            <SelectContent>
              {appointmentOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id || ""}>
                  {opt.label} ({opt.date})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="transcript">Session Transcript *</Label>
          <Textarea
            id="transcript"
            placeholder="Paste the complete session transcript..."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="h-40 resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {transcript.length} characters • AI will generate structured clinical notes
          </p>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="size-4 mr-2" />
              Generate Clinical Notes
            </>
          )}
        </Button>
      </form>

      {taskId && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Generation Status</span>
              <TaskStatusIndicator status={(taskResult as any)?.status} />
            </div>
            {(taskResult as any)?.result && (
              <div className="rounded-lg bg-background p-4 text-sm space-y-2 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {JSON.stringify((taskResult as any).result, null, 2)}
                </pre>
              </div>
            )}
            {(taskResult as any)?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{(taskResult as any).error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Assess Risk Tab
// ============================================================================

function AssessRiskTab({ patients }: { patients: Patient[] }) {
  const [selectedPatientId, setSelectedPatientId] = useState("")
  const [context, setContext] = useState("")
  const [taskId, setTaskId] = useState<string | null>(null)

  const { execute, loading } = useAssessRisk()
  const { data: taskResult } = useTaskStatus(taskId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPatientId || !context.trim()) {
      alert("Please select a patient and provide context")
      return
    }

    try {
      const result: any = await execute({
        patientId: selectedPatientId,
        context,
      })
      setTaskId(result.taskId)
      setContext("")
    } catch (err) {
      console.error("Failed to submit risk assessment:", err)
    }
  }

  const patientOptions = patients.map((p) => ({
    id: p.id,
    label: `${p.firstName} ${p.lastName}`,
  }))

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="risk-patient">Select Patient *</Label>
          <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
            <SelectTrigger id="risk-patient">
              <SelectValue placeholder="Choose a patient..." />
            </SelectTrigger>
            <SelectContent>
              {patientOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id || ""}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="risk-context">Risk Assessment Context *</Label>
          <Textarea
            id="risk-context"
            placeholder="Describe the clinical context, observations, and any concerning behaviors or statements..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
            className="h-32 resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {context.length} characters • AI will evaluate risk level and provide recommendations
          </p>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Assessing...
            </>
          ) : (
            <>
              <AlertTriangle className="size-4 mr-2" />
              Assess Risk Level
            </>
          )}
        </Button>
      </form>

      {taskId && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Assessment Status</span>
              <TaskStatusIndicator status={(taskResult as any)?.status} />
            </div>
            {(taskResult as any)?.result && (
              <div className="rounded-lg bg-background p-4 text-sm space-y-2 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {JSON.stringify((taskResult as any).result, null, 2)}
                </pre>
              </div>
            )}
            {(taskResult as any)?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{(taskResult as any).error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Extract Action Items Tab
// ============================================================================

function ExtractActionItemsTab({ appointments, patients }: { appointments: Appointment[]; patients: Patient[] }) {
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("")
  const [content, setContent] = useState("")
  const [taskId, setTaskId] = useState<string | null>(null)

  const { execute, loading } = useExtractActionItems()
  const { data: taskResult } = useTaskStatus(taskId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAppointmentId || !content.trim()) {
      alert("Please select an appointment and provide content")
      return
    }

    try {
      const result: any = await execute({
        appointmentId: selectedAppointmentId,
        content,
      })
      setTaskId(result.taskId)
      setContent("")
    } catch (err) {
      console.error("Failed to extract action items:", err)
    }
  }

  const getPatientName = (patientId?: string) => {
    const patient = patients.find((p) => p.id === patientId)
    return patient ? `${patient.firstName} ${patient.lastName}` : "Unknown"
  }

  const appointmentOptions = appointments.map((apt) => ({
    id: apt.id,
    label: `${getPatientName(apt.patientId)} - ${apt.type || "Session"}`,
    date: new Date(apt.scheduledAt || "").toLocaleDateString(),
  }))

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="action-apt">Select Appointment *</Label>
          <Select value={selectedAppointmentId} onValueChange={setSelectedAppointmentId}>
            <SelectTrigger id="action-apt">
              <SelectValue placeholder="Choose an appointment..." />
            </SelectTrigger>
            <SelectContent>
              {appointmentOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id || ""}>
                  {opt.label} ({opt.date})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="action-content">Session Content *</Label>
          <Textarea
            id="action-content"
            placeholder="Paste session notes, goals discussed, or treatment plan..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-32 resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {content.length} characters • AI will identify and extract action items
          </p>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Extracting...
            </>
          ) : (
            <>
              <CheckCircle className="size-4 mr-2" />
              Extract Action Items
            </>
          )}
        </Button>
      </form>

      {taskId && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Extraction Status</span>
              <TaskStatusIndicator status={(taskResult as any)?.status} />
            </div>
            {(taskResult as any)?.result && (
              <div className="rounded-lg bg-background p-4 text-sm space-y-2 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {JSON.stringify((taskResult as any).result, null, 2)}
                </pre>
              </div>
            )}
            {(taskResult as any)?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{(taskResult as any).error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Generate Progress Report Tab
// ============================================================================

function GenerateProgressReportTab({ patients }: { patients: Patient[] }) {
  const [selectedPatientId, setSelectedPatientId] = useState("")
  const [taskId, setTaskId] = useState<string | null>(null)

  const { execute, loading } = useGenerateProgressReport()
  const { data: taskResult } = useTaskStatus(taskId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPatientId) {
      alert("Please select a patient")
      return
    }

    try {
      const result: any = await execute(selectedPatientId)
      setTaskId(result.taskId)
    } catch (err) {
      console.error("Failed to generate progress report:", err)
    }
  }

  const patientOptions = patients.map((p) => ({
    id: p.id,
    label: `${p.firstName} ${p.lastName}`,
  }))

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="report-patient">Select Patient *</Label>
          <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
            <SelectTrigger id="report-patient">
              <SelectValue placeholder="Choose a patient..." />
            </SelectTrigger>
            <SelectContent>
              {patientOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id || ""}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          AI will analyze all available patient data including mood entries, notes, appointments, and progress to
          generate a comprehensive progress report.
        </p>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Generating Report...
            </>
          ) : (
            <>
              <Download className="size-4 mr-2" />
              Generate Progress Report
            </>
          )}
        </Button>
      </form>

      {taskId && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Report Generation Status</span>
              <TaskStatusIndicator status={(taskResult as any)?.status} />
            </div>
            {(taskResult as any)?.result && (
              <div className="rounded-lg bg-background p-4 text-sm space-y-2 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {JSON.stringify((taskResult as any).result, null, 2)}
                </pre>
              </div>
            )}
            {(taskResult as any)?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{(taskResult as any).error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function AIAssistantPage() {
  const { data: patients, loading: patientsLoading } = usePatients()
  const { data: appointments, loading: appointmentsLoading } = useAppointments()
  const { data: moodEntries, loading: moodEntriesLoading } = useMoodEntries(null)

  const patientsList = (patients as Patient[]) || []
  const appointmentsList = (appointments as Appointment[]) || []
  const moodEntriesList = (moodEntries as MoodEntry[]) || []

  const isLoading = patientsLoading || appointmentsLoading || moodEntriesLoading

  return (
    <PortalShell
      title="AI Clinical Assistant"
      subtitle="AI-powered tools for documentation, analysis, and clinical decision support"
    >
      <div className="space-y-4">
        <Alert>
          <Sparkles className="size-4" />
          <AlertDescription>
            All AI operations are powered by Gemini. Tasks run asynchronously and results are available in real-time.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-blue-600" />
                AI Operations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="summarize" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                  <TabsTrigger value="summarize" className="text-xs">
                    Summarize
                  </TabsTrigger>
                  <TabsTrigger value="mood" className="text-xs">
                    Mood Analysis
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="text-xs">
                    Generate Notes
                  </TabsTrigger>
                  <TabsTrigger value="risk" className="text-xs">
                    Assess Risk
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs">
                    Action Items
                  </TabsTrigger>
                  <TabsTrigger value="report" className="text-xs">
                    Progress Report
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="summarize" className="mt-6">
                  <SummarizeNotesTab appointments={appointmentsList} patients={patientsList} />
                </TabsContent>

                <TabsContent value="mood" className="mt-6">
                  <AnalyzeMoodTab patients={patientsList} moodEntries={moodEntriesList} />
                </TabsContent>

                <TabsContent value="notes" className="mt-6">
                  <GenerateClinicalNotesTab appointments={appointmentsList} patients={patientsList} />
                </TabsContent>

                <TabsContent value="risk" className="mt-6">
                  <AssessRiskTab patients={patientsList} />
                </TabsContent>

                <TabsContent value="actions" className="mt-6">
                  <ExtractActionItemsTab appointments={appointmentsList} patients={patientsList} />
                </TabsContent>

                <TabsContent value="report" className="mt-6">
                  <GenerateProgressReportTab patients={patientsList} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  )
}
