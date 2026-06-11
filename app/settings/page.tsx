"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/app/protected-route"
import { useAuth } from "@/app/providers"
import { PortalShell } from "@/components/portal-shell"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Smartphone, Laptop, Monitor, ShieldCheck, Loader2 } from "lucide-react"
import {
  defaultWeeklyAvailability,
  fromStoredAvailability,
  toMobileAvailability,
  type DayAvailability,
} from "@/lib/availability"

type ProfileForm = {
  name: string
  email: string
  licenseNumber: string
  qualifications: string
  specializations: string
  profilePhoto: string
  bio: string
}

export default function SettingsPage() {
  return (
    <ProtectedRoute allowedRoles={["therapist"]} requireVerified>
      <SettingsContent />
    </ProtectedRoute>
  )
}

function SettingsContent() {
  const { user } = useAuth()
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    name: "",
    email: "",
    licenseNumber: "",
    qualifications: "",
    specializations: "",
    profilePhoto: "",
    bio: "",
  })
  const [availability, setAvailability] = useState<DayAvailability[]>(defaultWeeklyAvailability())

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (!user) return
      setLoadingProfile(true)
      setSaveMessage(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(`${apiBaseUrl}/api/auth/profile`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        })

        if (!response.ok) {
          throw new Error("Failed to fetch profile")
        }

        const result = await response.json()

        if (cancelled) return

        const data = result?.profile || {}
        const specializations = Array.isArray(data.specializations)
          ? data.specializations.join(", ")
          : ""

        setProfileForm({
          name: (data.name as string) || user.displayName || "",
          email: (data.email as string) || user.email || "",
          licenseNumber: (data.licenseNumber as string) || "",
          qualifications: (data.qualifications as string) || "",
          specializations,
          profilePhoto: (data.profilePhoto as string) || user.photoURL || "",
          bio: (data.bio as string) || "",
        })

        setAvailability(fromStoredAvailability(data.availability))
      } catch {
        if (!cancelled) {
          setSaveMessage("Could not load your profile data.")
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false)
        }
      }
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleSaveProfile() {
    if (!user) return
    setSavingProfile(true)
    setSaveMessage(null)

    try {
      const specializations = profileForm.specializations
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
      const idToken = await user.getIdToken()

      const response = await fetch(`${apiBaseUrl}/api/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: profileForm.name.trim(),
          email: profileForm.email.trim(),
          licenseNumber: profileForm.licenseNumber.trim(),
          qualifications: profileForm.qualifications.trim(),
          specializations,
          profilePhoto: profileForm.profilePhoto.trim(),
          bio: profileForm.bio.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save profile")
      }

      setSaveMessage("Profile saved successfully.")
    } catch {
      setSaveMessage("Failed to save profile. Please try again.")
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSaveAvailability() {
    if (!user) return
    setSavingAvailability(true)
    setAvailabilityMessage(null)

    try {
      const idToken = await user.getIdToken()

      const response = await fetch(`${apiBaseUrl}/api/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          availability: toMobileAvailability(availability),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save availability")
      }

      setAvailabilityMessage("Availability saved successfully.")
    } catch {
      setAvailabilityMessage("Failed to save availability. Please try again.")
    } finally {
      setSavingAvailability(false)
    }
  }

  function updateAvailability(day: string, patch: Partial<DayAvailability>) {
    setAvailability((prev) =>
      prev.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry)),
    )
  }

  const avatarName = profileForm.name || user?.displayName || "Therapist"
  const avatarFallback = avatarName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "TH"

  return (
    <PortalShell title="Settings" subtitle="Manage your profile, availability, and security">
      <Tabs defaultValue="profile">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  <AvatarImage src={profileForm.profilePhoto || "/placeholder.svg"} alt={avatarName} />
                  <AvatarFallback>{avatarFallback}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">Profile photo URL</p>
                  <p className="mt-1 text-xs text-muted-foreground">Paste an image URL to update avatar.</p>
                </div>
                <Badge variant="outline" className="ml-auto border-success/30 bg-success/10 text-success">
                  <ShieldCheck className="size-3" />
                  Verified
                </Badge>
              </div>

              {saveMessage ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{saveMessage}</p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                    disabled={loadingProfile || savingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={loadingProfile || savingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <Input
                    id="licenseNumber"
                    value={profileForm.licenseNumber}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, licenseNumber: e.target.value }))}
                    disabled={loadingProfile || savingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qualifications">Qualifications</Label>
                  <Input
                    id="qualifications"
                    value={profileForm.qualifications}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, qualifications: e.target.value }))}
                    disabled={loadingProfile || savingProfile}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="specializations">Specializations (comma-separated)</Label>
                  <Input
                    id="specializations"
                    value={profileForm.specializations}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, specializations: e.target.value }))}
                    disabled={loadingProfile || savingProfile}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="profilePhoto">Profile Photo URL</Label>
                  <Input
                    id="profilePhoto"
                    value={profileForm.profilePhoto}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, profilePhoto: e.target.value }))}
                    disabled={loadingProfile || savingProfile}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bio">Professional Bio</Label>
                  <Textarea
                    id="bio"
                    rows={4}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
                    disabled={loadingProfile || savingProfile}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={loadingProfile || savingProfile || !user}>
                  {savingProfile ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Availability Schedule</CardTitle>
              <p className="text-sm text-muted-foreground">Set your weekly working hours for patient bookings</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {availabilityMessage ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{availabilityMessage}</p>
              ) : null}

              {availability.map((entry) => (
                <div key={entry.day} className="flex items-center gap-4 rounded-lg border border-border p-3">
                  <Switch
                    checked={entry.enabled}
                    onCheckedChange={(checked) => updateAvailability(entry.day, { enabled: Boolean(checked) })}
                    disabled={loadingProfile || savingAvailability}
                  />
                  <span className="w-28 text-sm font-medium text-foreground">{entry.day}</span>
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      type="time"
                      value={entry.start}
                      onChange={(e) => updateAvailability(entry.day, { start: e.target.value })}
                      className="w-28"
                      disabled={!entry.enabled || loadingProfile || savingAvailability}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={entry.end}
                      onChange={(e) => updateAvailability(entry.day, { end: e.target.value })}
                      className="w-28"
                      disabled={!entry.enabled || loadingProfile || savingAvailability}
                    />
                  </div>
                </div>
              ))}

              <div className="flex justify-end">
                <Button onClick={handleSaveAvailability} disabled={!user || loadingProfile || savingAvailability}>
                  {savingAvailability ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save availability"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Toggle label="Risk alerts" detail="Get notified immediately for high & critical risk events" on />
              <Toggle label="New booking requests" detail="Email and in-app notification" on />
              <Toggle label="Clinical summaries" detail="When AI summaries are ready for review" on />
              <Toggle label="Appointment reminders" detail="Reminders for upcoming sessions" on />
              <Toggle label="Admin messages" detail="Platform and verification updates" />
              <Toggle label="Weekly digest" detail="Summary of your practice metrics" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Current Password" value="" type="password" placeholder="••••••••" />
              <Field label="New Password" value="" type="password" placeholder="••••••••" />
              <Field label="Confirm New Password" value="" type="password" placeholder="••••••••" />
              <div className="flex justify-end">
                <Button>Update password</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connected Devices</CardTitle>
              <p className="text-sm text-muted-foreground">Devices currently signed in to your account</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Device icon={Laptop} name="MacBook Pro" location="San Francisco, CA · Current session" current />
              <Device icon={Smartphone} name="iPhone 15" location="San Francisco, CA · 2 hours ago" />
              <Device icon={Monitor} name="Clinic Workstation" location="Oakland, CA · Yesterday" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PortalShell>
  )
}

function Field({
  label,
  value,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  type?: string
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} defaultValue={value} placeholder={placeholder} />
    </div>
  )
}

function Toggle({ label, detail, on }: { label: string; detail: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch defaultChecked={on} />
    </div>
  )
}

function Device({
  icon: Icon,
  name,
  location,
  current,
}: {
  icon: typeof Laptop
  name: string
  location: string
  current?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{location}</p>
      </div>
      {current ? (
        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
          Active
        </Badge>
      ) : (
        <Button variant="ghost" size="sm" className="text-destructive">
          Sign out
        </Button>
      )}
    </div>
  )
}
