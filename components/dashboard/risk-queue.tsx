"use client"

import Link from "next/link"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { RiskBadge } from "@/components/status-badges"
import { usePatients } from "@/lib/hooks"
import { ChevronRight, AlertTriangle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 }

export function RiskQueue() {
  const { data: patients, loading, error } = usePatients()

  const sorted = (patients || [])
    .sort((a: any, b: any) => {
      const aRiskScore = riskOrder[a.riskLevel as keyof typeof riskOrder] ?? 4
      const bRiskScore = riskOrder[b.riskLevel as keyof typeof riskOrder] ?? 4
      return aRiskScore - bRiskScore
    })
    .slice(0, 5) // Show top 5 high-risk patients

  const LoadingSkeleton = () => (
    <div className="space-y-2 px-6 py-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-24" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Patient Risk Priority Queue</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Sorted by risk level — critical patients first
          </p>
        </div>
        <Link href="/patients">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            View all
            <ChevronRight className="size-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="hidden grid-cols-[2fr_1fr_1fr_auto] gap-4 border-y border-border px-6 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Patient</span>
          <span>Risk Level</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>Failed to load patients</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No patients yet
            </div>
          ) : (
            sorted.map((p: any) => (
              <Link
                key={p.id}
                href={`/patients/${p.id}`}
                className="grid grid-cols-2 items-center gap-4 px-6 py-3.5 transition-colors hover:bg-accent/30 md:grid-cols-[2fr_1fr_1fr_auto]"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage
                      src={p.profilePhoto || "/placeholder.svg"}
                      alt={`${p.firstName} ${p.lastName}`}
                    />
                    <AvatarFallback>{p.firstName?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {`${p.firstName} ${p.lastName}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.email}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end md:justify-start">
                  <RiskBadge level={p.riskLevel || "low"} />
                </div>
                <div className="hidden text-sm text-muted-foreground md:block">
                  {p.status === "active" ? (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                      {p.status}
                    </span>
                  )}
                </div>
                <div className="hidden justify-end md:flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.preventDefault()
                    }}
                  >
                    Review
                  </Button>
                </div>
              </Link>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
