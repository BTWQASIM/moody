import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import type { RiskLevel, MoodTrend } from "@/lib/data"

const riskStyles: Record<RiskLevel, string> = {
  low: "bg-success/10 text-success border-success/20",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  high: "bg-destructive/10 text-destructive border-destructive/20",
  critical: "bg-destructive text-destructive-foreground border-destructive",
}

const riskLabel: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        riskStyles[level],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          level === "critical" ? "bg-destructive-foreground" : "bg-current",
        )}
      />
      {riskLabel[level]}
    </span>
  )
}

export function MoodTrendBadge({ trend }: { trend: MoodTrend }) {
  const config = {
    improving: { icon: TrendingUp, className: "text-success", label: "Improving" },
    stable: { icon: Minus, className: "text-muted-foreground", label: "Stable" },
    declining: { icon: TrendingDown, className: "text-destructive", label: "Declining" },
  }[trend]
  const Icon = config.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.className)}>
      <Icon className="size-3.5" />
      {config.label}
    </span>
  )
}
