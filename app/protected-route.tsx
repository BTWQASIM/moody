"use client"

import { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/providers"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, loading } = useAuth()

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

  if (!user) {
    router.push("/login")
    return null
  }

  return <>{children}</>
}
