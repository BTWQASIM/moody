"use client"

import Link from "next/link"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAppointments, usePatients } from "@/lib/hooks"
import { getResolvedPatientName } from "@/lib/patient-mapping"
import { Clock, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { useMemo } from "react"

function formatTime(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDay(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function UpcomingAppointments() {
  const { data: appointments, loading } = useAppointments()
  const { data: patients } = usePatients()

  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }, [now])

  const { todayAppointments, upcomingAppointments } = useMemo(() => {
    const appointmentList = Array.isArray(appointments) ? appointments : []

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const today_ = appointmentList
      .filter((a: any) => {
        const aptDate = new Date(a.scheduledAt)
        aptDate.setHours(0, 0, 0, 0)
        return aptDate.getTime() === today.getTime() && new Date(a.scheduledAt) > now
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.scheduledAt).getTime() -
          new Date(b.scheduledAt).getTime()
      )

    const upcoming = appointmentList
      .filter((a: any) => {
        const aptDate = new Date(a.scheduledAt)
        return aptDate >= tomorrow && aptDate < nextWeek
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.scheduledAt).getTime() -
          new Date(b.scheduledAt).getTime()
      )
      .slice(0, 4)

    return {
      todayAppointments: today_,
      upcomingAppointments: upcoming,
    }
  }, [appointments, today, now])

  const LoadingSkeleton = () => (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Upcoming Appointments</CardTitle>
        <Link href="/appointments">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            Calendar
            <ChevronRight className="size-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {todayAppointments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Today
                </p>
                <div className="space-y-2">
                  {todayAppointments.map((a: any) => (
                    <AppointmentRow
                      key={a.id}
                      appointment={a}
                      patients={(patients as any[]) || []}
                      highlight
                    />
                  ))}
                </div>
              </div>
            )}
            {upcomingAppointments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  This Week
                </p>
                <div className="space-y-2">
                  {upcomingAppointments.map((a: any) => (
                    <AppointmentRow
                      key={a.id}
                      appointment={a}
                      patients={(patients as any[]) || []}
                    />
                  ))}
                </div>
              </div>
            )}
            {todayAppointments.length === 0 &&
              upcomingAppointments.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No upcoming appointments
                </div>
              )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function AppointmentRow({
  appointment,
  patients,
  highlight,
}: {
  appointment: any
  patients: any[]
  highlight?: boolean
}) {
  const patientName =
    getResolvedPatientName(appointment, patients) || "Unknown Patient"

  return (
    <Link href={`/appointments`}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-accent/30",
          highlight
            ? "border-primary/20 bg-primary/5"
            : "border-border"
        )}
      >
        <div className="flex w-14 shrink-0 flex-col items-center">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatTime(appointment.scheduledAt)}
          </span>
          {!highlight && (
            <span className="text-[10px] text-muted-foreground">
              {formatDay(appointment.scheduledAt)}
            </span>
          )}
        </div>
        <Avatar className="size-8">
          <AvatarImage
            src={
              appointment.patientProfilePhoto ||
              "/placeholder.svg"
            }
            alt={patientName}
          />
          <AvatarFallback className="text-xs">
            {patientName[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {patientName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {appointment.type || "Therapy Session"}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {appointment.duration || 60}m
        </div>
        {appointment.status === "pending" && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
            Pending
          </span>
        )}
      </div>
    </Link>
  )
}
