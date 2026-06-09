"use client"

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
import { retentionData } from "@/lib/data"
import { Users, CheckCircle2, AlertTriangle, TrendingUp, Repeat } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const sessionsConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
} satisfies ChartConfig

const servedConfig = {
  served: { label: "Patients Served", color: "var(--chart-2)" },
} satisfies ChartConfig

const metrics: { label: string; value: string; sub: string; icon: LucideIcon; accent: string }[] = [
  { label: "Patients Served", value: "210", sub: "+12% vs last quarter", icon: Users, accent: "text-primary bg-primary/10" },
  { label: "Sessions Completed", value: "715", sub: "Across 6 months", icon: CheckCircle2, accent: "text-success bg-success/10" },
  { label: "Risk Alerts Generated", value: "48", sub: "9 critical escalations", icon: AlertTriangle, accent: "text-destructive bg-destructive/10" },
  { label: "Avg Mood Improvement", value: "+34%", sub: "From intake baseline", icon: TrendingUp, accent: "text-success bg-success/10" },
  { label: "Therapy Retention Rate", value: "87%", sub: "8-week retention", icon: Repeat, accent: "text-primary bg-primary/10" },
]

export default function ReportsPage() {
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
            <ChartContainer config={sessionsConfig} className="h-[260px] w-full">
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
            <ChartContainer config={servedConfig} className="h-[260px] w-full">
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
