"use client"

import { CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import { getPasswordRequirementChecks } from "@/lib/password-policy"

export function PasswordRequirements({
  password,
  className,
}: {
  password: string
  className?: string
}) {
  const checks = getPasswordRequirementChecks(password)

  return (
    <ul className={cn("space-y-1.5", className)} aria-label="Password requirements">
      {checks.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex items-start gap-2 text-xs",
            item.met ? "text-success" : "text-muted-foreground",
          )}
        >
          {item.met ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
