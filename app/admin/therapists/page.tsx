"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ProtectedRoute } from "@/app/protected-route"
import { PortalShell } from "@/components/portal-shell"
import { useAuth } from "@/app/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

type Therapist = {
  uid: string
  name?: string
  email?: string
  phone?: string
  qualifications?: string
  licenseNumber?: string
  yearsOfExperience?: number
  status?: string
  verified?: boolean
  profilePhoto?: string
  bio?: string
  specializations?: string[]
  documentUrls?: string[]
}

type EditState = {
  name: string
  phone: string
  qualifications: string
  licenseNumber: string
  yearsOfExperience: string
}

function emptyEditState(): EditState {
  return {
    name: "",
    phone: "",
    qualifications: "",
    licenseNumber: "",
    yearsOfExperience: "",
  }
}

function TherapistAccessContent() {
  const searchParams = useSearchParams()
  const { user, refreshClaims } = useAuth()
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [loading, setLoading] = useState(true)
  const [savingUid, setSavingUid] = useState<string | null>(null)
  const [openingDocument, setOpeningDocument] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [edits, setEdits] = useState<Record<string, EditState>>({})

  const pendingCount = useMemo(
    () => therapists.filter((t) => !t.verified).length,
    [therapists],
  )

  const therapistQuery = (searchParams.get("q") || "").trim().toLowerCase()

  const filteredTherapists = useMemo(() => {
    if (!therapistQuery) {
      return therapists
    }

    return therapists.filter((therapist) => {
      const haystack = [
        therapist.name,
        therapist.email,
        therapist.phone,
        therapist.licenseNumber,
        therapist.qualifications,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(therapistQuery)
    })
  }, [therapistQuery, therapists])

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

      const nextEdits: Record<string, EditState> = {}
      rows.forEach((t) => {
        nextEdits[t.uid] = {
          name: t.name || "",
          phone: t.phone || "",
          qualifications: t.qualifications || "",
          licenseNumber: t.licenseNumber || "",
          yearsOfExperience:
            t.yearsOfExperience !== undefined ? String(t.yearsOfExperience) : "",
        }
      })
      setEdits(nextEdits)
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

  async function updateAccess(uid: string, verified: boolean, accessStatus?: string) {
    if (!user) return

    setSavingUid(uid)
    setError("")
    setSuccess("")

    try {
      const token = await user.getIdToken(true)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiBase}/api/auth/therapists/${uid}/access`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          verified,
          status: accessStatus || (verified ? "verified" : "suspended"),
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.detail || "Failed to update therapist access")
      }

      setSuccess(
        verified
          ? "Therapist verified successfully"
          : accessStatus === "rejected"
            ? "Therapist application rejected"
            : "Therapist access revoked",
      )
      await loadTherapists()
    } catch (err: any) {
      setError(err.message || "Failed to update therapist access")
    } finally {
      setSavingUid(null)
    }
  }

  async function saveCredentials(uid: string) {
    if (!user) return

    const edit = edits[uid]
    if (!edit) return

    setSavingUid(uid)
    setError("")
    setSuccess("")

    try {
      const token = await user.getIdToken(true)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiBase}/api/auth/therapists/${uid}/credentials`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: edit.name,
          phone: edit.phone,
          qualifications: edit.qualifications,
          licenseNumber: edit.licenseNumber,
          yearsOfExperience: edit.yearsOfExperience ? Number(edit.yearsOfExperience) : undefined,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.detail || "Failed to update therapist credentials")
      }

      setSuccess("Therapist credentials updated")
      await loadTherapists()
    } catch (err: any) {
      setError(err.message || "Failed to update therapist credentials")
    } finally {
      setSavingUid(null)
    }
  }

  async function viewCredentialDocument(url: string, documentKey: string) {
    if (!user) return

    setOpeningDocument(documentKey)
    setError("")
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      if (!url.startsWith("/api/uploads/file/")) {
        const externalUrl = new URL(url)
        if (!["https:", "http:"].includes(externalUrl.protocol)) {
          throw new Error("Credential document URL is invalid")
        }
        window.open(externalUrl.toString(), "_blank", "noopener,noreferrer")
        return
      }

      const token = await user.getIdToken()
      const response = await fetch(`${apiBase}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || "Failed to open credential document")
      }

      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = objectUrl
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (err: any) {
      setError(err.message || "Failed to open credential document")
    } finally {
      setOpeningDocument(null)
    }
  }

  function updateEdit(uid: string, patch: Partial<EditState>) {
    setEdits((prev) => ({
      ...prev,
      [uid]: {
        ...(prev[uid] || emptyEditState()),
        ...patch,
      },
    }))
  }

  return (
    <PortalShell
      title="Therapist Access"
      subtitle={
        therapistQuery
          ? `Showing ${filteredTherapists.length} result(s) for "${searchParams.get("q")}"`
          : "Review applications, verify therapists, and manage credential access"
      }
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
        {success ? <div className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-700">{success}</div> : null}

        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Loading therapist applications...</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTherapists.map((therapist) => {
              const edit = edits[therapist.uid]
              return (
                <Card key={therapist.uid}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-11">
                        <AvatarImage src={therapist.profilePhoto || "/placeholder.svg"} alt={therapist.name || "Therapist"} />
                        <AvatarFallback>{therapist.name?.charAt(0) || "T"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{therapist.name || "Unnamed Therapist"}</CardTitle>
                        <p className="text-sm text-muted-foreground">{therapist.email || therapist.uid}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={therapist.verified ? "border-emerald-300 text-emerald-700" : "border-amber-300 text-amber-700"}
                    >
                      {therapist.verified ? "Verified" : (therapist.status || "Pending").replaceAll("_", " ")}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Name</Label>
                        <Input
                          value={edit?.name || ""}
                          onChange={(e) => updateEdit(therapist.uid, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Phone</Label>
                        <Input
                          value={edit?.phone || ""}
                          onChange={(e) => updateEdit(therapist.uid, { phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>License Number</Label>
                        <Input
                          value={edit?.licenseNumber || ""}
                          onChange={(e) => updateEdit(therapist.uid, { licenseNumber: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Years of Experience</Label>
                        <Input
                          type="number"
                          min={0}
                          value={edit?.yearsOfExperience || ""}
                          onChange={(e) => updateEdit(therapist.uid, { yearsOfExperience: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Qualifications</Label>
                      <Input
                        value={edit?.qualifications || ""}
                        onChange={(e) => updateEdit(therapist.uid, { qualifications: e.target.value })}
                      />
                    </div>

                    {therapist.bio ? <div><p className="text-sm font-medium">Professional Bio</p><p className="text-sm text-muted-foreground">{therapist.bio}</p></div> : null}
                    {therapist.specializations?.length ? <div><p className="text-sm font-medium">Specializations</p><div className="mt-1 flex flex-wrap gap-1">{therapist.specializations.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</div></div> : null}
                    <div>
                      <p className="text-sm font-medium">Credential Documents</p>
                      {therapist.documentUrls?.length ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {therapist.documentUrls.map((url, index) => {
                            const documentKey = `${therapist.uid}-${index}`
                            return (
                              <Button
                                key={`${url}-${index}`}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={openingDocument === documentKey}
                                onClick={() => viewCredentialDocument(url, documentKey)}
                              >
                                {openingDocument === documentKey
                                  ? "Opening..."
                                  : `View Document ${index + 1}`}
                              </Button>
                            )
                          })}
                        </div>
                      ) : <p className="text-sm text-destructive">No credential documents uploaded</p>}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => updateAccess(therapist.uid, true, "verified")}
                        disabled={savingUid === therapist.uid || therapist.verified}
                      >
                        Verify & Grant Access
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => updateAccess(therapist.uid, false, "suspended")}
                        disabled={savingUid === therapist.uid || !therapist.verified}
                      >
                        Revoke Access
                      </Button>
                      {!therapist.verified && !["rejected", "suspended"].includes(String(therapist.status || "").toLowerCase()) ? (
                        <Button
                          variant="destructive"
                          onClick={() => updateAccess(therapist.uid, false, "rejected")}
                          disabled={savingUid === therapist.uid}
                        >
                          Reject Application
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => saveCredentials(therapist.uid)}
                        disabled={savingUid === therapist.uid}
                      >
                        Save Credential Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {!filteredTherapists.length ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No therapists found for your search.
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </PortalShell>
  )
}

export default function AdminTherapistsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]} requireVerified={false}>
      <TherapistAccessContent />
    </ProtectedRoute>
  )
}
