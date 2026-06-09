"use client"

import { PortalShell } from "@/components/portal-shell"
import { ProtectedRoute } from "@/app/protected-route"
import { StatCard } from "@/components/dashboard/stat-card"
import { RiskQueue } from "@/components/dashboard/risk-queue"
import { EarlyWarningAlerts } from "@/components/dashboard/early-warning-alerts"
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments"
import { Users, CalendarClock, Sparkles, AlertTriangle } from "lucide-react"
import { useAuth } from "@/app/providers"
import {
  usePatients,
  useAppointments,
  useRiskAlerts,
  useMoodEntries,
} from "@/lib/hooks"
import { Skeleton } from "@/components/ui/skeleton"
import { useState, useMemo } from "react"

function DashboardContent() {
  const { user } = useAuth()
  const { data: patients, loading: patientsLoading } = usePatients()
  const { data: appointments, loading: appointmentsLoading } = useAppointments()
  const { data: alerts, loading: alertsLoading } = useRiskAlerts()
  const { data: moodEntries, loading: moodLoading } = useMoodEntries(null)

  // Calculate statistics
  const stats = useMemo(() => {
    const patientList = (patients as any[]) || []
    const appointmentList = (appointments as any[]) || []
    const alertList = (alerts as any[]) || []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayAppointments = appointmentList.filter((apt: any) => {
      const aptDate = new Date(apt.scheduledAt)
      return aptDate >= today && aptDate < tomorrow
    })

    const highRiskPatients = patientList.filter(
      (p: any) => p.riskLevel === "high" || p.riskLevel === "critical"
    )

    const pendingAppointments = appointmentList.filter(
      (apt: any) => apt.status === "pending"
    )

    return {
      totalPatients: patientList.length,
      activePatients: patientList.filter((p: any) => p.status === "active")
        .length,
      highRiskCount: highRiskPatients.length,
      todayAppointments: todayAppointments.length,
      upcomingAppointments: appointmentList.filter(
        (apt: any) => new Date(apt.scheduledAt) > now
      ).length,
      pendingAppointments: pendingAppointments.length,
      riskAlerts: alertList.filter((a: any) => !a.isAcknowledged).length,
      criticalAlerts: alertList.filter(
        (a: any) => a.riskLevel === "critical" && !a.isAcknowledged
      ).length,
    }
  }, [patients, appointments, alerts])

  const isLoading = patientsLoading || appointmentsLoading || alertsLoading

  const StatCardSkeleton = () => (
    <div className="space-y-3 rounded-lg border p-4">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )

  return (
    <PortalShell
      title={`Welcome back, ${user?.email?.split("@")[0] || "Therapist"}`}
      subtitle="Here's your clinical overview for today"
    >
      {stats.criticalAlerts > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" />
          <span>
            You have {stats.criticalAlerts} critical alert
            {stats.criticalAlerts !== 1 ? "s" : ""} requiring immediate attention
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title="Patients"
              icon={Users}
              accent="primary"
              items={[
                { label: "Total", value: stats.totalPatients },
                { label: "Active", value: stats.activePatients },
                {
                  label: "High Risk",
                  value: stats.highRiskCount,
                  emphasis: "danger",
                },
              ]}
            />
            <StatCard
              title="Appointments"
              icon={CalendarClock}
              accent="success"
              items={[
                { label: "Today", value: stats.todayAppointments },
                { label: "Upcoming", value: stats.upcomingAppointments },
                {
                  label: "Pending",
                  value: stats.pendingAppointments,
                  emphasis: "warning",
                },
              ]}
            />
            <StatCard
              title="AI Insights"
              icon={Sparkles}
              accent="primary"
              items={[
                {
                  label: "Risk Alerts",
                  value: stats.riskAlerts,
                  emphasis: stats.riskAlerts > 0 ? "danger" : undefined,
                },
                { label: "High Risk", value: stats.highRiskCount },
                {
                  label: "Critical",
                  value: stats.criticalAlerts,
                  emphasis: stats.criticalAlerts > 0 ? "danger" : undefined,
                },
              ]}
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <RiskQueue />
          <EarlyWarningAlerts />
        </div>
        <div className="space-y-4">
          <UpcomingAppointments />
        </div>
      </div>
    </PortalShell>
  )
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
