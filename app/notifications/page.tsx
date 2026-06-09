"use client"

import { useState } from "react"
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

interface Notification {
  id: string
  category: Category
  title: string
  detail: string
  time: string
  unread: boolean
}

const config: Record<Category, { icon: LucideIcon; accent: string; label: string }> = {
  booking: { icon: CalendarPlus, accent: "text-primary bg-primary/10", label: "Booking Request" },
  risk: { icon: AlertTriangle, accent: "text-destructive bg-destructive/10", label: "Risk Alert" },
  summary: { icon: Sparkles, accent: "text-primary bg-primary/10", label: "Clinical Summary" },
  appointment: { icon: CalendarClock, accent: "text-success bg-success/10", label: "Appointment" },
  admin: { icon: ShieldAlert, accent: "text-warning-foreground bg-warning/15", label: "Admin Message" },
}

const initial: Notification[] = [
  { id: "1", category: "risk", title: "Critical risk alert — Marcus Reed", detail: "Crisis risk detected from recent journal analysis. Immediate review recommended.", time: "12 min ago", unread: true },
  { id: "2", category: "booking", title: "New booking request — Liam Chen", detail: "Requested PTSD Treatment session on Feb 11 at 10:00.", time: "1 hour ago", unread: true },
  { id: "3", category: "summary", title: "Clinical summary ready — Aisha Okafor", detail: "AI-generated session summary is ready for your review.", time: "2 hours ago", unread: true },
  { id: "4", category: "appointment", title: "Appointment confirmed — Sofia Martinez", detail: "Addiction Recovery session confirmed for today at 14:30.", time: "5 hours ago", unread: false },
  { id: "5", category: "admin", title: "License verification reminder", detail: "Your license renewal documentation is due in 30 days.", time: "Yesterday", unread: false },
  { id: "6", category: "summary", title: "Mood trend change — Noah Williams", detail: "Mood scores improved 18% over the past two weeks.", time: "2 days ago", unread: false },
]

export default function NotificationsPage() {
  const [items, setItems] = useState(initial)
  const unreadCount = items.filter((i) => i.unread).length

  return (
    <PortalShell title="Notifications" subtitle={`${unreadCount} unread updates`}>
      <div className="mb-4 flex justify-end">
        <Button
          variant="outline"
          onClick={() => setItems((prev) => prev.map((i) => ({ ...i, unread: false })))}
        >
          <Check className="size-4" />
          Mark all as read
        </Button>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {items.map((n) => {
            const c = config[n.category]
            const Icon = c.icon
            return (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-3 p-4 transition-colors hover:bg-accent/30",
                  n.unread && "bg-primary/[0.03]",
                )}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", c.accent)}>
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {n.unread && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.label} · {n.time}
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
