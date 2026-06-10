"use client"

import { useMemo } from "react"
import { PortalShell } from "@/components/portal-shell"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { useAppointments, usePatients, useRiskAlerts } from "@/lib/hooks"
import { Users, CheckCircle2, AlertTriangle, TrendingUp, Repeat } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const sessionsConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
} satisfies ChartConfig

const servedConfig = {
  served: { label: "Patients Served", color: "var(--chart-2)" },
} satisfies ChartConfig

export default function ReportsPage() {
  const { data: patients } = usePatients()
  const { data: appointments } = useAppointments()
  const { data: alerts } = useRiskAlerts()

  const retentionData = useMemo(() => {
    const now = new Date()
    const months: Array<{ key: string; month: string; sessions: number; served: number }> = []

    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      months.push({
        key,
        month: d.toLocaleDateString("en-US", { month: "short" }),
        sessions: 0,
        served: 0,
      })
    }

    const monthIndex = new Map(months.map((m, idx) => [m.key, idx]))
    const servedSets = months.map(() => new Set<string>())

    for (const appt of (appointments || []) as any[]) {
      const scheduledAt = appt?.scheduledAt ? new Date(appt.scheduledAt) : null
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) continue
      const key = `${scheduledAt.getFullYear()}-${String(scheduledAt.getMonth() + 1).padStart(2, "0")}`
      const idx = monthIndex.get(key)
      if (idx === undefined) continue

      months[idx].sessions += 1
      if (appt?.patientId) {
        servedSets[idx].add(String(appt.patientId))
      }
    }

    return months.map((m, idx) => ({
      month: m.month,
      sessions: m.sessions,
      served: servedSets[idx].size,
    }))
  }, [appointments])

  const totalPatients = (patients || []).length
  const totalSessions = (appointments || []).length
  const totalAlerts = (alerts || []).length
  const criticalAlerts = ((alerts || []) as any[]).filter((a) => a.riskLevel === "critical").length
  const activePatients = new Set(((appointments || []) as any[]).map((a) => a.patientId).filter(Boolean)).size

  const metrics: { label: string; value: string; sub: string; icon: LucideIcon; accent: string }[] = [
    {
      label: "Patients Served",
      value: String(totalPatients),
      sub: `${activePatients} active in recent appointments`,
      icon: Users,
      accent: "text-primary bg-primary/10",
    },
    {
      label: "Sessions Completed",
      value: String(totalSessions),
      sub: "Across available records",
      icon: CheckCircle2,
      accent: "text-success bg-success/10",
    },
    {
      label: "Risk Alerts Generated",
      value: String(totalAlerts),
      sub: `${criticalAlerts} critical escalations`,
      icon: AlertTriangle,
      accent: "text-destructive bg-destructive/10",
    },
    {
      label: "Avg Sessions / Patient",
      value: totalPatients > 0 ? (totalSessions / totalPatients).toFixed(1) : "0.0",
      sub: "Engagement ratio",
      icon: TrendingUp,
      accent: "text-success bg-success/10",
    },
    {
      label: "Therapy Retention Proxy",
      value:
        activePatients > 0
          ? `${Math.min(100, Math.round((activePatients / Math.max(totalPatients, 1)) * 100))}%`
          : "0%",
      sub: "Active caseload share",
      icon: Repeat,
      accent: "text-primary bg-primary/10",
    },
  ]

  return (
    <PortalShell title="Reports & Analytics" subtitle="Track your clinical outcomes and practice performance">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <Card key={m.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{m.label}</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{m.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{m.sub}</p>
                </div>
                <span className={`flex size-10 items-center justify-center rounded-lg ${m.accent}`}>
                  <Icon className="size-5" />
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions Completed</CardTitle>
            <p className="text-sm text-muted-foreground">Monthly session volume</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={sessionsConfig} className="h-65 w-full">
              <BarChart data={retentionData} margin={{ left: 0, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patients Served</CardTitle>
            <p className="text-sm text-muted-foreground">Active caseload over time</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={servedConfig} className="h-65 w-full">
              <AreaChart data={retentionData} margin={{ left: 0, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="served"
                  stroke="var(--color-served)"
                  fill="var(--color-served)"
                  fillOpacity={0.15}
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  )
}
