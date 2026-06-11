"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { User, onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase"

type UserRole = "admin" | "therapist"

interface AuthContextType {
  user: User | null
  loading: boolean
  error: string | null
  role: UserRole | null
  verified: boolean
  refreshClaims: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [verified, setVerified] = useState(false)

  async function resolveAccessFromBackend(token: string) {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const response = await fetch(`${baseUrl}/api/auth/access-status`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to resolve access status")
    }

    const payload = await response.json()
    const accessRole = payload?.access?.role === "admin" ? "admin" : "therapist"
    const accessVerified = Boolean(payload?.access?.verified)
    setRole(accessRole)
    setVerified(accessVerified)
  }

  async function refreshClaims() {
    const current = auth.currentUser
    if (!current) {
      setRole(null)
      setVerified(false)
      return
    }

    const tokenResult = await current.getIdTokenResult(true)
    try {
      await resolveAccessFromBackend(tokenResult.token)
    } catch {
      const nextRole = tokenResult.claims.role
      const nextVerified = tokenResult.claims.verified
      setRole(nextRole === "admin" ? "admin" : "therapist")
      setVerified(Boolean(nextVerified))
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser)
        if (currentUser) {
          try {
            const tokenResult = await currentUser.getIdTokenResult()
            try {
              await resolveAccessFromBackend(tokenResult.token)
            } catch {
              const nextRole = tokenResult.claims.role
              const nextVerified = tokenResult.claims.verified
              setRole(nextRole === "admin" ? "admin" : "therapist")
              setVerified(Boolean(nextVerified))
            }
          } catch {
            setRole("therapist")
            setVerified(false)
          }
        } else {
          setRole(null)
          setVerified(false)
        }
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, role, verified, refreshClaims }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
