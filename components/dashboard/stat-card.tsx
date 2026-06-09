import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatItem {
  label: string
  value: string | number
  emphasis?: "default" | "danger" | "success" | "warning"
}

export function StatCard({
  title,
  icon: Icon,
  items,
  accent = "primary",
}: {
  title: string
  icon: LucideIcon
  items: StatItem[]
  accent?: "primary" | "danger" | "success"
}) {
  const accentStyles = {
    primary: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
  }[accent]

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-9 items-center justify-center rounded-lg", accentStyles)}>
          <Icon className="size-[18px]" />
        </span>
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.label}>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                item.emphasis === "danger" && "text-destructive",
                item.emphasis === "success" && "text-success",
                item.emphasis === "warning" && "text-warning-foreground",
                (!item.emphasis || item.emphasis === "default") && "text-foreground",
              )}
            >
              {item.value}
            </p>
            <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
