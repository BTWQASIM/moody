"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useRiskAlerts } from "@/lib/hooks"
import { AlertTriangle, AlertCircle, Info, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    wrap: "border-destructive/30 bg-destructive/5",
    chip: "bg-destructive text-destructive-foreground",
    label: "Critical",
  },
  high: {
    icon: AlertTriangle,
    wrap: "border-orange-300/30 bg-orange-50",
    chip: "bg-orange-600 text-white",
    label: "High",
  },
  medium: {
    icon: AlertCircle,
    wrap: "border-yellow-300/40 bg-yellow-50",
    chip: "bg-yellow-600 text-white",
    label: "Medium",
  },
  low: {
    icon: Info,
    wrap: "border-border bg-muted/40",
    chip: "bg-secondary text-secondary-foreground",
    label: "Low",
  },
} as const

export function EarlyWarningAlerts() {
  const { data: alerts, loading, error } = useRiskAlerts()

  const LoadingSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  )

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">Early Warning Alerts</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Risk alerts requiring clinical attention
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-sm text-muted-foreground">
            Failed to load alerts
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No active alerts — all patients are stable
          </div>
        ) : (
          alerts
            .filter((alert: any) => !alert.isAcknowledged)
            .slice(0, 4)
            .map((alert: any) => {
              const cfg =
                severityConfig[
                  (alert.riskLevel?.toLowerCase() ||
                    "low") as keyof typeof severityConfig
                ]
              const Icon = cfg.icon
              return (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-lg border p-4",
                    cfg.wrap
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md",
                        cfg.chip
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {alert.patientFirstName || "Patient"} — Risk Alert
                        </p>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            cfg.chip
                          )}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Avatar className="size-5">
                          <AvatarImage
                            src={
                              alert.patientPhoto || "/placeholder.svg"
                            }
                            alt={alert.patientFirstName}
                          />
                          <AvatarFallback className="text-[9px]">
                            {alert.patientFirstName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          Created{" "}
                          {new Date(alert.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {alert.description || "Mood indicators suggest elevated risk"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-foreground">
                          <span className="text-muted-foreground">
                            Status:{" "}
                          </span>
                          {alert.isAcknowledged
                            ? "Acknowledged"
                            : "Pending"}
                        </p>
                        <Link href={`/patients/${alert.patientId}`}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                          >
                            Review
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
        )}
      </CardContent>
    </Card>
  )
}
