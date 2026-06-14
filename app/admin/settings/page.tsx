"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/app/protected-route"
import { useAuth } from "@/app/providers"
import { PortalShell } from "@/components/portal-shell"
import { auth } from "@/lib/firebase"
import { terminatePortalSession } from "@/lib/auth-session"
import { getPasswordValidationError } from "@/lib/password-policy"
import { PasswordRequirements } from "@/components/password-requirements"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function AdminSettingsContent() {
  const router = useRouter()
  const { user } = useAuth()
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const [name, setName] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(user?.displayName || "")
  }, [user])

  const email = useMemo(() => user?.email || "", [user])

  async function onSaveName(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    const nextName = name.trim()
    if (!nextName) {
      setError("Name cannot be empty.")
      return
    }

    setSavingName(true)
    setMessage(null)
    setError(null)

    try {
      await updateProfile(user, { displayName: nextName })

      const token = await user.getIdToken(true)
      const response = await fetch(`${apiBaseUrl}/api/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: nextName }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || "Failed to update name")
      }

      setMessage("Name updated successfully.")
    } catch (err: any) {
      setError(err.message || "Failed to update name.")
    } finally {
      setSavingName(false)
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault()

    if (!user || !email) {
      setError("No email found for this account.")
      return
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError("Fill in all password fields.")
      return
    }

    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match.")
      return
    }

    const passwordError = getPasswordValidationError(newPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password.")
      return
    }

    setChangingPassword(true)
    setMessage(null)
    setError(null)

    try {
      const credential = EmailAuthProvider.credential(email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmNewPassword("")
      setMessage("Password changed successfully.")
    } catch (err: any) {
      setError(err.message || "Failed to change password.")
    } finally {
      setChangingPassword(false)
    }
  }

  async function onLogout() {
    setLoggingOut(true)
    setMessage(null)
    setError(null)

    try {
      await terminatePortalSession()
      router.replace("/login")
    } catch (err: any) {
      setError(err.message || "Failed to log out.")
      setLoggingOut(false)
    }
  }

  return (
    <PortalShell title="Admin Settings" subtitle="Manage your admin account and security actions">
      <div className="space-y-4">
        {message ? <div className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveName} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="admin-name">Name</Label>
                <Input
                  id="admin-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  disabled={savingName}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="admin-email">Email</Label>
                <Input id="admin-email" value={email} disabled />
              </div>

              <Button type="submit" disabled={savingName}>
                {savingName ? "Saving..." : "Save Name"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={onChangePassword} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={changingPassword}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  disabled={changingPassword}
                />
                <PasswordRequirements password={newPassword} className="pt-1" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={changingPassword}
                />
              </div>
              <Button variant="outline" type="submit" disabled={changingPassword}>
                {changingPassword ? "Changing password..." : "Change Password"}
              </Button>
            </form>

            <Button variant="destructive" onClick={onLogout} disabled={loggingOut}>
              {loggingOut ? "Logging out..." : "Log Out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  )
}

export default function AdminSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]} requireVerified={false}>
      <AdminSettingsContent />
    </ProtectedRoute>
  )
}
