"use client"

import { useState } from "react"
import { ProtectedRoute } from "@/app/protected-route"
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
  useExtractActionItems,
  useGenerateProgressReport,
  useTaskStatus,
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
import { normalizeTaskStatus, type TaskStatus } from "@/lib/task-status"

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
  const config: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: "Pending", color: "text-yellow-600", icon: <Clock className="size-4" /> },
    processing: { label: "Processing", color: "text-blue-600", icon: <Loader2 className="size-4 animate-spin" /> },
    completed: { label: "Completed", color: "text-green-600", icon: <CheckCircle className="size-4" /> },
    failed: { label: "Failed", color: "text-red-600", icon: <AlertTriangle className="size-4" /> },
  }

  const s = config[normalizeTaskStatus(status)]
  return (
    <div className="flex items-center gap-2">
      <span className={s.color}>{s.icon}</span>
      <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
    </div>
  )
}

function renderSummaryMarkdown(summary: string) {
  return summary.split(/\r?\n/).map((line, index) => {
    const key = `${index}-${line}`
    const heading = line.match(/^\*\*(.+)\*\*$/)
    const listItem = line.match(/^\s*(\d+)\.\s+(.+)$/)

    if (!line.trim()) {
      return <div key={key} className="h-3" />
    }

    if (heading) {
      return (
        <h4 key={key} className="font-semibold text-foreground">
          {heading[1]}
        </h4>
      )
    }

    if (listItem) {
      return (
        <div key={key} className="flex gap-2 pl-1">
          <span className="font-medium text-muted-foreground">{listItem[1]}.</span>
          <span>{listItem[2]}</span>
        </div>
      )
    }

    const parts = line.split(/(\*\*.+?\*\*)/g)
    return (
      <p key={key}>
        {parts.map((part, partIndex) => {
          const bold = part.match(/^\*\*(.+)\*\*$/)
          return bold ? (
            <strong key={partIndex}>{bold[1]}</strong>
          ) : (
            <span key={partIndex}>{part}</span>
          )
        })}
      </p>
    )
  })
}

function formatGeneratedAt(generatedAt: string) {
  const date = new Date(generatedAt)
  return Number.isNaN(date.getTime())
    ? generatedAt
    : date.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
}

function withoutSummaryHeading(summary: string) {
  return summary.replace(/^\s*\*\*Session Summary(?:\s*\([^*\n]+\))?\*\*\s*\n?/, "")
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
  const summary =
    typeof (taskResult as any)?.result?.summary === "string"
      ? (taskResult as any).result.summary
      : null
  const generatedAt =
    typeof (taskResult as any)?.result?.generatedAt === "string"
      ? (taskResult as any).result.generatedAt
      : null
  const displaySummary = summary ? withoutSummaryHeading(summary) : null

  const downloadSummary = () => {
    if (!displaySummary) return

    const generatedLine = generatedAt
      ? `\n**Generated:** ${formatGeneratedAt(generatedAt)}\n`
      : ""
    const blob = new Blob(
      [`# Session Summary\n${generatedLine}\n${displaySummary}`],
      { type: "text/markdown;charset=utf-8" }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `session-summary-${selectedAppointmentId}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

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
            {displaySummary && (
              <div className="rounded-lg bg-background p-5 text-sm max-h-96 overflow-y-auto">
                <div className="mb-4 border-b pb-3">
                  <h3 className="text-base font-semibold">Session Summary</h3>
                  {generatedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Generated {formatGeneratedAt(generatedAt)}
                    </p>
                  )}
                </div>
                <div className="space-y-2 leading-6 text-muted-foreground">
                  {renderSummaryMarkdown(displaySummary)}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-5"
                  onClick={downloadSummary}
                >
                  <Download className="size-4 mr-2" />
                  Download Summary
                </Button>
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
  return (
    <ProtectedRoute allowedRoles={["therapist"]} requireVerified>
      <AIAssistantPageContent />
    </ProtectedRoute>
  )
}

function AIAssistantPageContent() {
  const { data: patients, loading: patientsLoading } = usePatients()
  const { data: appointments, loading: appointmentsLoading } = useAppointments()

  const patientsList = (patients as Patient[]) || []
  const appointmentsList = (appointments as Appointment[]) || []

  const isLoading = patientsLoading || appointmentsLoading

  return (
    <PortalShell
      title="AI Clinical Assistant"
      subtitle="AI-powered tools for documentation, analysis, and clinical decision support"
    >
      <div className="space-y-4">
        <Alert>
          <Sparkles className="size-4" />
          <AlertDescription>
            All AI operations are powered by OpenRouter. Tasks run asynchronously and results are available in real-time.
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
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summarize" className="text-xs">
                    Summarize
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
