"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Eye, EyeOff, Heart, Shield } from "lucide-react"
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth"
import { auth } from "@/lib/firebase"
import { terminatePortalSession } from "@/lib/auth-session"

const BLUE = "#2d74ba"
const BLUE_DARK = "#1e4a6e"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sessionCleared, setSessionCleared] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function endExistingSession() {
      await terminatePortalSession()
      if (!cancelled) {
        setSessionCleared(true)
        setMounted(true)
      }
    }

    endExistingSession()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence,
      )
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
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
          setError(
            "Your therapist access has been revoked. Please contact the administrator for assistance."
          )
        } else {
          setError(
            "Your account is pending admin verification. You will be able to sign in after approval."
          )
        }
        setLoading(false)
        return
      }

      router.replace(role === "admin" ? "/admin/dashboard" : "/dashboard")
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string; message?: string }
      let message = firebaseErr.message || "Failed to sign in. Check your credentials."

      if (firebaseErr.code === "auth/configuration-not-found") {
        message = "Firebase is not properly configured. Please check the admin console."
      } else if (firebaseErr.code === "auth/user-not-found") {
        message = "No account found with this email address."
      } else if (firebaseErr.code === "auth/wrong-password") {
        message = "Incorrect password. Please try again."
      } else if (firebaseErr.code === "auth/invalid-email") {
        message = "Please enter a valid email address."
      } else if (firebaseErr.code === "auth/user-disabled") {
        message = "This account has been disabled."
      } else if (firebaseErr.code === "auth/too-many-requests") {
        message = "Too many login attempts. Please try again later."
      } else if (firebaseErr.code === "auth/invalid-credential") {
        message =
          "Invalid email or password. Please check your credentials, register a new account, or reset your password."
      }

      setError(message)
      setLoading(false)
    }
  }

  if (!sessionCleared) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center space-y-3 text-center">
        <div
          className="size-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${BLUE} transparent transparent transparent` }}
        />
        <p className="text-sm text-gray-500">Ending your previous session...</p>
      </div>
    )
  }

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 24 }}
      transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
    >
      <div className="lg:hidden flex items-center gap-2.5 mb-10">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: BLUE }}
        >
          <Heart size={15} className="text-white" />
        </div>
        <span
          className="font-semibold text-base"
          style={{ fontFamily: "var(--font-lora), serif", color: "#1a2535" }}
        >
          Moody
        </span>
      </div>

      <div className="mb-8">
        <motion.p
          className="text-xs font-medium tracking-widest uppercase mb-2"
          style={{ color: BLUE, letterSpacing: "0.18em" }}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: mounted ? 1 : 0, x: mounted ? 0 : -8 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          Welcome back
        </motion.p>
        <motion.h2
          style={{
            fontFamily: "var(--font-lora), serif",
            fontSize: "clamp(1.6rem, 3vw, 2rem)",
            color: "#1a2535",
            fontWeight: 500,
            lineHeight: 1.3,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: mounted ? 1 : 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          Sign in to your
          <br />
          <em style={{ fontStyle: "italic", color: BLUE }}>clinical dashboard</em>
        </motion.h2>
        <p className="text-sm text-gray-500 mt-2 font-light">
          Access your dashboard and patient insights.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-7">
        <div className="h-px flex-1" style={{ background: "rgba(45,116,186,0.15)" }} />
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(45,116,186,0.3)" }} />
        <div className="h-px flex-1" style={{ background: "rgba(45,116,186,0.15)" }} />
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium mb-1.5 tracking-wide"
            style={{ color: "#6b7280", letterSpacing: "0.06em" }}
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@clinic.com"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
            style={{
              background: "#f3f4f6",
              border: "1.5px solid transparent",
              color: "#1a2535",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = BLUE
              e.currentTarget.style.background = "#fff"
              e.currentTarget.style.boxShadow = "0 0 0 4px rgba(45,116,186,0.1)"
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "transparent"
              e.currentTarget.style.background = "#f3f4f6"
              e.currentTarget.style.boxShadow = "none"
            }}
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium tracking-wide"
              style={{ color: "#6b7280", letterSpacing: "0.06em" }}
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: BLUE }}
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-all duration-200"
              style={{
                background: "#f3f4f6",
                border: "1.5px solid transparent",
                color: "#1a2535",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = BLUE
                e.currentTarget.style.background = "#fff"
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(45,116,186,0.1)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "transparent"
                e.currentTarget.style.background = "#f3f4f6"
                e.currentTarget.style.boxShadow = "none"
              }}
            />
            <button
              type="button"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-opacity hover:opacity-60"
              style={{ color: "#9ca3af" }}
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRemember((r) => !r)}
            className="relative rounded-full transition-colors duration-300 shrink-0"
            style={{
              background: remember ? BLUE : "#d1d5db",
              height: "22px",
              width: "40px",
            }}
            aria-pressed={remember}
            aria-label="Remember this device"
          >
            <motion.div
              className="absolute top-0.5 rounded-full bg-white shadow-sm"
              style={{ width: "18px", height: "18px" }}
              animate={{ x: remember ? 19 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
          <span className="text-sm text-gray-500">Remember this device</span>
        </div>

        <motion.button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl py-3.5 text-sm font-medium text-white relative overflow-hidden disabled:opacity-70"
          style={{
            background: `linear-gradient(135deg, ${BLUE_DARK} 0%, ${BLUE} 100%)`,
            boxShadow: "0 4px 20px rgba(45,116,186,0.4)",
          }}
          whileHover={loading ? undefined : { scale: 1.01, boxShadow: "0 6px 28px rgba(45,116,186,0.5)" }}
          whileTap={loading ? undefined : { scale: 0.985 }}
          transition={{ duration: 0.18 }}
        >
          <span style={{ letterSpacing: "0.03em" }}>
            {loading ? "Signing in..." : "Sign in"}
          </span>
          {!loading && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
              }}
              animate={{ x: ["-100%", "200%"] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                repeatDelay: 1.8,
                ease: "easeInOut",
              }}
            />
          )}
        </motion.button>
      </form>

      <motion.p
        className="text-center text-sm mt-7 text-gray-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: mounted ? 1 : 0 }}
        transition={{ duration: 0.7, delay: 0.8 }}
      >
        New to Moody?{" "}
        <Link
          href="/register"
          className="font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
        >
          Apply as a therapist
        </Link>
      </motion.p>

      <motion.div
        className="mt-10 flex items-center justify-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: mounted ? 0.5 : 0 }}
        transition={{ duration: 0.8, delay: 1.1 }}
      >
        <Shield size={12} className="text-gray-400" />
        <p className="text-xs text-gray-400">HIPAA compliant &middot; End-to-end encrypted</p>
      </motion.div>
    </motion.div>
  )
}
