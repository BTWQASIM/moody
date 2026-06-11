"use client"

import { useEffect, useMemo, useState } from "react"
import { ProtectedRoute } from "@/app/protected-route"
import { useAuth } from "@/app/providers"
import { PortalShell } from "@/components/portal-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  CalendarPlus,
  AlertTriangle,
  Sparkles,
  CalendarClock,
  ShieldAlert,
  Check,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Category = "booking" | "risk" | "summary" | "appointment" | "admin"

interface NotificationRow {
  id: string
  type?: string
  title: string
  message: string
  createdAt?: string
  isRead?: boolean
}

const config: Record<Category, { icon: LucideIcon; accent: string; label: string }> = {
  booking: { icon: CalendarPlus, accent: "text-primary bg-primary/10", label: "Booking Request" },
  risk: { icon: AlertTriangle, accent: "text-destructive bg-destructive/10", label: "Risk Alert" },
  summary: { icon: Sparkles, accent: "text-primary bg-primary/10", label: "Clinical Summary" },
  appointment: { icon: CalendarClock, accent: "text-success bg-success/10", label: "Appointment" },
  admin: { icon: ShieldAlert, accent: "text-warning-foreground bg-warning/15", label: "Admin Message" },
}

function resolveCategory(type: string | undefined, role: "admin" | "therapist" | null): Category {
  if (role === "admin") return "admin"
  if (!type) return "summary"
  if (type.includes("risk")) return "risk"
  if (type.includes("appointment")) return "appointment"
  if (type.includes("booking")) return "booking"
  return "summary"
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "therapist"]} requireVerified>
      <NotificationsContent />
    </ProtectedRoute>
  )
}

function NotificationsContent() {
  const { user, role } = useAuth()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const unreadCount = useMemo(
    () => items.filter((i) => !i.isRead).length,
    [items],
  )

  useEffect(() => {
    let cancelled = false

    async function loadNotifications() {
      if (!user) return
      setLoading(true)
      setError("")

      try {
        const token = await user.getIdToken()
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        const response = await fetch(`${apiBase}/api/notifications/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error("Failed to load notifications")
        }

        const result = await response.json()
        if (cancelled) return
        setItems((result?.notifications as NotificationRow[]) || [])
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load notifications")
          setItems([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadNotifications()
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <PortalShell title="Notifications" subtitle={`${unreadCount} unread updates`}>
      <div className="mb-4 flex justify-end">
        <Button
          variant="outline"
          onClick={() => setItems((prev) => prev.map((i) => ({ ...i, isRead: true })))}
        >
          <Check className="size-4" />
          Mark all as read
        </Button>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {error ? <div className="p-4 text-sm text-destructive">{error}</div> : null}
          {loading ? <div className="p-4 text-sm text-muted-foreground">Loading notifications...</div> : null}

          {!loading && !items.length ? (
            <div className="p-4 text-sm text-muted-foreground">
              {role === "admin"
                ? "No pending therapist verification requests."
                : "No notifications yet."}
            </div>
          ) : null}

          {items.map((n) => {
            const category = resolveCategory(n.type, role)
            const c = config[category]
            const Icon = c.icon
            const time = n.createdAt ? String(n.createdAt) : "recent"
            return (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-3 p-4 transition-colors hover:bg-accent/30",
                  !n.isRead && "bg-primary/[0.03]",
                )}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", c.accent)}>
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {!n.isRead && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.label} · {time}
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </PortalShell>
  )
}
