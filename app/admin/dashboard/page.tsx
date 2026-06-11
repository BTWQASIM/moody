"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ProtectedRoute } from "@/app/protected-route"
import { PortalShell } from "@/components/portal-shell"
import { useAuth } from "@/app/providers"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Therapist = {
  uid: string
  name?: string
  email?: string
  verified?: boolean
}

function AdminDashboardContent() {
  const { user, refreshClaims } = useAuth()
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const pendingCount = useMemo(
    () => therapists.filter((t) => !t.verified).length,
    [therapists],
  )
  const displayName = user?.displayName?.trim() || user?.email?.split("@")[0] || "Admin"

  async function loadTherapists() {
    if (!user) return

    setLoading(true)
    setError("")

    try {
      const token = await user.getIdToken(true)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiBase}/api/auth/therapists`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.detail || "Failed to fetch therapists")
      }

      const payload = await res.json()
      const rows: Therapist[] = payload.therapists || []
      setTherapists(rows)
    } catch (err: any) {
      setError(err.message || "Failed to load therapist applications")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshClaims().catch(() => undefined)
    loadTherapists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  return (
    <PortalShell
      title={`Welcome back, ${displayName}`}
      subtitle="Overview of therapist onboarding and access status"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Total Therapists</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{therapists.length}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pending Verification</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-amber-600">{pendingCount}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Verified</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-emerald-600">
              {therapists.filter((t) => t.verified).length}
            </CardContent>
          </Card>
        </div>

        {error ? <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Loading dashboard metrics...</CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Admin Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => router.push("/admin/therapists")}>Open Therapist Access</Button>
                <Button variant="outline" onClick={() => router.push("/admin/settings")}>Open Admin Settings</Button>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Applications requiring review</span>
                  <Badge variant="outline" className="border-amber-300 text-amber-700">
                    {pendingCount} Pending
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  )
}

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]} requireVerified={false}>
      <AdminDashboardContent />
    </ProtectedRoute>
  )
}
