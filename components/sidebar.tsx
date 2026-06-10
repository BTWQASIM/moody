"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Sparkles,
  CalendarDays,
  Stethoscope,
  MessageSquare,
  BarChart3,
  Bell,
  Settings,
  HeartPulse,
} from "lucide-react"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/ai-assistant", label: "AI Clinical Assistant", icon: Sparkles },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/services", label: "Services", icon: Stethoscope },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <HeartPulse className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">Moody</p>
          <p className="text-xs text-muted-foreground">Therapist Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="m-3 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-4">
        <div className="flex items-center gap-2 text-success">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <p className="text-xs font-semibold">Secure session active</p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          AES-256 encrypted. HIPAA-inspired audit logging enabled.
        </p>
      </div>
    </div>
  )
}
