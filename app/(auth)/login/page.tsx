"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { HeartPulse } from "lucide-react"
import { signInWithEmailAndPassword, signOut } from "firebase/auth"
import { auth } from "@/lib/firebase"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")
    
    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const tokenResult = await credential.user.getIdTokenResult(true)
      const token = tokenResult.token
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

      let role = tokenResult.claims.role === "admin" ? "admin" : "therapist"
      let verified = Boolean(tokenResult.claims.verified)
      let accessStatus = verified ? "verified" : "pending_verification"

      try {
        const accessRes = await fetch(`${baseUrl}/api/auth/access-status`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (accessRes.ok) {
          const accessData = await accessRes.json()
          role = accessData?.access?.role === "admin" ? "admin" : "therapist"
          verified = Boolean(accessData?.access?.verified)
          accessStatus = String(
            accessData?.access?.status || (verified ? "verified" : "pending_verification")
          ).toLowerCase()
        }
      } catch {
        // Fall back to token claims if backend access status check fails.
      }

      if (role === "therapist" && !verified) {
        await signOut(auth)
        if (["suspended", "revoked", "inactive"].includes(accessStatus)) {
          setError("Your therapist access has been revoked. Please contact the administrator for assistance.")
        } else {
          setError("Your account is pending admin verification. You will be able to sign in after approval.")
        }
        setLoading(false)
        return
      }

      router.push(role === "admin" ? "/admin/dashboard" : "/dashboard")
    } catch (err: any) {
      // Map Firebase error codes to user-friendly messages
      let message = err.message || "Failed to sign in. Check your credentials."
      
      if (err.code === "auth/configuration-not-found") {
        message = "Firebase is not properly configured. Please check the admin console."
      } else if (err.code === "auth/user-not-found") {
        message = "No account found with this email address."
      } else if (err.code === "auth/wrong-password") {
        message = "Incorrect password. Please try again."
      } else if (err.code === "auth/invalid-email") {
        message = "Please enter a valid email address."
      } else if (err.code === "auth/user-disabled") {
        message = "This account has been disabled."
      } else if (err.code === "auth/too-many-requests") {
        message = "Too many login attempts. Please try again later."
      } else if (err.code === "auth/invalid-credential") {
        message = "Invalid email or password. Please check your credentials, register a new account, or reset your password."
      }
      
      setError(message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2.5 lg:hidden">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <HeartPulse className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Moody</p>
          <p className="text-xs text-muted-foreground">Therapist Portal</p>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to access your clinical dashboard and patient insights.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@clinic.com"
              className="bg-card pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="Enter your password"
              className="bg-card px-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch id="remember" defaultChecked />
            <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
              Remember this device
            </Label>
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Signing in..." : "Sign in securely"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New to Moody?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Apply as a therapist
        </Link>
      </p>
    </div>
  )
}
