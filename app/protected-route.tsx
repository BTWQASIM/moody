"use client"

import { ReactNode, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/providers"
import { terminatePortalSession } from "@/lib/auth-session"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Role = "admin" | "therapist"

export function ProtectedRoute({
  children,
  allowedRoles = ["therapist"],
  requireVerified = true,
}: {
  children: ReactNode
  allowedRoles?: Role[]
  requireVerified?: boolean
}) {
  const router = useRouter()
  const { user, loading, role, verified } = useAuth()

  let redirectTo: string | null = null

  if (!loading) {
    if (!user) {
      redirectTo = "/login"
    } else if (role && !allowedRoles.includes(role)) {
      redirectTo = role === "admin" ? "/admin/dashboard" : "/dashboard"
    } else if (requireVerified && role === "therapist" && !verified) {
      redirectTo = "/login"
    }
  }

  useEffect(() => {
    if (!redirectTo) return

    if (redirectTo === "/login") {
      void terminatePortalSession().finally(() => {
        router.replace("/login")
      })
      return
    }

    router.replace(redirectTo)
  }, [redirectTo, router])

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted || loading || user) return
      router.replace("/login")
    }

    window.addEventListener("pageshow", handlePageShow)
    return () => window.removeEventListener("pageshow", handlePageShow)
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Loading</CardTitle>
            <CardDescription>Verifying your authentication...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (redirectTo) {
    return null
  }

  return <>{children}</>
}
