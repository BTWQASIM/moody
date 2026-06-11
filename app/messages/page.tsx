"use client"

import { useState, useEffect, useRef } from "react"
import { ProtectedRoute } from "@/app/protected-route"
import { PortalShell } from "@/components/portal-shell"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  useMessageThreads,
  useThreadMessages,
  useSendMessage,
  useCreateThread,
  usePatients,
} from "@/lib/hooks"
import {
  Send,
  MessageSquare,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  ChevronLeft,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

// ============================================================================
// Type Definitions
// ============================================================================

interface MessageThread {
  id?: string
  therapistUid?: string
  patientId?: string
  subject?: string
  lastMessage?: string
  lastMessageAt?: string | Date
  isActive?: boolean
  createdAt?: string | Date
}

interface Message {
  id?: string
  threadId?: string
  senderId?: string
  senderType?: string
  recipientId?: string
  content?: string
  attachments?: string[]
  isRead?: boolean
  readAt?: string | Date
  createdAt?: string | Date
}

interface Patient {
  id?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  profilePhoto?: string
}

// ============================================================================
// Thread List Component
// ============================================================================

function ThreadListView({
  threads,
  patients,
  loading,
  searchQuery,
  onSearchChange,
  activeThreadId,
  onSelectThread,
  onCreateThread,
}: {
  threads: MessageThread[]
  patients: Patient[]
  loading: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  activeThreadId: string | null
  onSelectThread: (threadId: string) => void
  onCreateThread: () => void
}) {
  const filteredThreads = threads.filter((thread) => {
    if (!searchQuery) return true
    const patient = patients.find((p) => p.id === thread.patientId)
    const patientName = `${patient?.firstName || ""} ${patient?.lastName || ""}`.toLowerCase()
    const subject = (thread.subject || "").toLowerCase()
    return (
      patientName.includes(searchQuery.toLowerCase()) ||
      subject.includes(searchQuery.toLowerCase())
    )
  })

  const getPatientName = (patientId?: string): string => {
    const patient = patients.find((p) => p.id === patientId)
    if (!patient) return "Unknown"
    return `${patient.firstName || ""} ${patient.lastName || ""}`.trim()
  }

  const formatDate = (date?: string | Date): string => {
    if (!date) return ""
    const d = new Date(date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    ) {
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
    } else if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return "Yesterday"
    } else {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }
  }

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="border-b border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Messages</h3>
          <Dialog>
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus className="size-4" />
                </Button>
              }
            />
            <CreateThreadDialog onComplete={onCreateThread} />
          </Dialog>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <MessageSquare className="size-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No conversations</p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery ? "No threads match your search" : "Start a new conversation"}
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const patient = patients.find((p) => p.id === thread.patientId)
            const isActive = thread.id === activeThreadId
            return (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id || "")}
                className={cn(
                  "w-full text-left border-b border-border/50 p-3 transition-colors hover:bg-muted",
                  isActive && "bg-muted"
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="size-10 shrink-0">
                    <AvatarImage src={patient?.profilePhoto || "/placeholder.svg"} />
                    <AvatarFallback>
                      {(patient?.firstName?.[0] || "?") + (patient?.lastName?.[0] || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">
                        {getPatientName(thread.patientId)}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDate(thread.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {thread.subject}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 line-clamp-2">
                      {thread.lastMessage}
                    </p>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Message Detail Component
// ============================================================================

function MessageDetailView({
  thread,
  messages,
  patients,
  loading,
  error,
  onSendMessage,
}: {
  thread: MessageThread | null
  messages: Message[]
  patients: Patient[]
  loading: boolean
  error: Error | null
  onSendMessage: (content: string) => Promise<void>
}) {
  const [messageContent, setMessageContent] = useState("")
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  if (!thread) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <MessageSquare className="size-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Select a conversation to start messaging</p>
        </div>
      </div>
    )
  }

  const patient = patients.find((p) => p.id === thread.patientId)
  const handleSend = async () => {
    if (!messageContent.trim()) return

    setSending(true)
    try {
      await onSendMessage(messageContent)
      setMessageContent("")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage src={patient?.profilePhoto || "/placeholder.svg"} />
            <AvatarFallback>
              {(patient?.firstName?.[0] || "?") + (patient?.lastName?.[0] || "?")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">
              {`${patient?.firstName || ""} ${patient?.lastName || ""}`.trim()}
            </h3>
            <p className="text-xs text-muted-foreground">{thread.subject}</p>
          </div>
        </div>
        <Link href={`/patients/${thread.patientId}`}>
          <Button variant="outline" size="sm">
            View Profile
          </Button>
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>Failed to load messages. Please try again.</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-16 w-64" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm">
            No messages yet. Start the conversation below.
          </div>
        ) : (
          messages.map((msg) => {
            const isFromTherapist = msg.senderType === "therapist"
            return (
              <div
                key={msg.id}
                className={cn("flex gap-2", isFromTherapist ? "flex-row-reverse" : "flex-row")}
              >
                {!isFromTherapist && (
                  <Avatar className="size-8 shrink-0">
                    <AvatarImage src={patient?.profilePhoto || "/placeholder.svg"} />
                    <AvatarFallback>
                      {(patient?.firstName?.[0] || "?") + (patient?.lastName?.[0] || "?")}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "max-w-xs rounded-lg px-4 py-2",
                    isFromTherapist
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(msg.createdAt || "").toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Send box */}
      <div className="border-t border-border p-4 space-y-2">
        <div className="flex gap-2">
          <Textarea
            placeholder="Type your message..."
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                handleSend()
              }
            }}
            className="resize-none h-20"
          />
          <Button
            onClick={handleSend}
            disabled={sending || !messageContent.trim()}
            className="self-end"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Ctrl+Enter to send</p>
      </div>
    </div>
  )
}

// ============================================================================
// Create Thread Dialog
// ============================================================================

function CreateThreadDialog({ onComplete }: { onComplete: () => void }) {
  const { execute, loading, error } = useCreateThread()
  const { data: patients } = usePatients()
  const [patientId, setPatientId] = useState("")
  const [subject, setSubject] = useState("")

  const handleCreate = async () => {
    if (!patientId || !subject.trim()) {
      alert("Please fill in all fields")
      return
    }

    try {
      await execute({
        patientId,
        subject,
      })

      setPatientId("")
      setSubject("")
      onComplete()
    } catch (err) {
      console.error("Failed to create thread:", err)
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Start New Conversation</DialogTitle>
        <DialogDescription>Create a new message thread with a patient.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="patient">Select Patient *</Label>
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger id="patient">
              <SelectValue placeholder="Choose a patient..." />
            </SelectTrigger>
            <SelectContent>
              {((patients as Patient[]) || []).map((p) => (
                <SelectItem key={p.id} value={p.id || ""}>
                  {p.firstName} {p.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Subject *</Label>
          <Input
            id="subject"
            placeholder="e.g., Weekly Check-in, Appointment Confirmation"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleCreate} disabled={loading} className="flex-1">
            {loading ? "Creating..." : "Create Thread"}
          </Button>
          <Button variant="outline" className="flex-1" disabled={loading}>
            Cancel
          </Button>
        </div>
      </div>
    </DialogContent>
  )
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function MessagesPage() {
  return (
    <ProtectedRoute allowedRoles={["therapist"]} requireVerified>
      <MessagesPageContent />
    </ProtectedRoute>
  )
}

function MessagesPageContent() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const { data: threads, loading: threadsLoading, error: threadsError } = useMessageThreads()
  const { data: messages, loading: messagesLoading, error: messagesError } = useThreadMessages(
    activeThreadId
  )
  const { data: patients } = usePatients()
  const { execute: sendMessage, loading: sendingMessage } = useSendMessage()

  const threadsList = (threads as MessageThread[]) || []
  const messagesList = (messages as Message[]) || []
  const patientsList = (patients as Patient[]) || []

  // Set first thread as active if available
  useEffect(() => {
    if (!activeThreadId && threadsList.length > 0) {
      setActiveThreadId(threadsList[0].id || null)
    }
  }, [threadsList, activeThreadId])

  const activeThread = threadsList.find((t) => t.id === activeThreadId) || null

  const handleSendMessage = async (content: string) => {
    if (!activeThreadId) return

    try {
      await sendMessage({
        threadId: activeThreadId,
        recipientId: activeThread?.patientId || "",
        content,
      })
    } catch (err) {
      console.error("Failed to send message:", err)
    }
  }

  return (
    <PortalShell
      title="Secure Messaging"
      subtitle="End-to-end encrypted communication with your patients"
    >
      {threadsError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="size-4" />
          <AlertDescription>Failed to load conversations. Please try again.</AlertDescription>
        </Alert>
      )}

      <Card className="flex h-[calc(100vh-10rem)] overflow-hidden">
        {/* Thread list - Desktop visible, mobile hidden */}
        <div className="hidden w-80 shrink-0 md:flex">
          <ThreadListView
            threads={threadsList}
            patients={patientsList}
            loading={threadsLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeThreadId={activeThreadId}
            onSelectThread={setActiveThreadId}
            onCreateThread={() => {
              // Will trigger a refetch through hooks
            }}
          />
        </div>

        {/* Message detail - Full width on mobile, right side on desktop */}
        <div className="flex-1 flex flex-col">
          {/* Mobile back button */}
          <div className="md:hidden border-b border-border p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveThreadId(null)}
              className="gap-2"
            >
              <ChevronLeft className="size-4" />
              Back to Conversations
            </Button>
          </div>

          {/* Message pane */}
          <MessageDetailView
            thread={activeThread}
            messages={messagesList}
            patients={patientsList}
            loading={messagesLoading}
            error={messagesError}
            onSendMessage={handleSendMessage}
          />
        </div>
      </Card>
    </PortalShell>
  )
}
