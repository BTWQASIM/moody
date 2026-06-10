"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Upload, Clock, CheckCircle2, FileText, User, BadgeCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase"

const specializationOptions = [
  "Anxiety",
  "Depression",
  "PTSD & Trauma",
  "Child Psychology",
  "Addiction Recovery",
  "Couples Therapy",
  "Grief Counseling",
]

type RegisterFormData = {
  name: string
  email: string
  password: string
  phone: string
}

type UploadStatus = "idle" | "selected" | "uploading" | "uploaded" | "failed"

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState<string[]>(["Anxiety"])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null)
  const [documentFiles, setDocumentFiles] = useState<File[]>([])
  const [photoStatus, setPhotoStatus] = useState<UploadStatus>("idle")
  const [docStatus, setDocStatus] = useState<UploadStatus>("idle")
  const [uploadedDocCount, setUploadedDocCount] = useState(0)

  const [formData, setFormData] = useState<RegisterFormData>({
    name: "",
    email: "",
    password: "",
    phone: "",
  })

  function toggleSpec(s: string) {
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function uploadRegistrationFiles(idToken: string) {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    let profilePhoto = ""
    const documentUrls: string[] = []

    if (profilePhotoFile) {
      setPhotoStatus("uploading")
      const formData = new FormData()
      formData.append("file", profilePhotoFile)
      const res = await fetch(`${baseUrl}/api/uploads/profile-photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      })

      if (!res.ok) {
        setPhotoStatus("failed")
        throw new Error("Failed to upload profile photo")
      }

      const data = await res.json()
      profilePhoto = data.fileUrl || ""
      setPhotoStatus("uploaded")
    } else {
      setPhotoStatus("idle")
    }

    setUploadedDocCount(0)

    for (const file of documentFiles) {
      setDocStatus("uploading")
      const formData = new FormData()
      formData.append("file", file)
      formData.append("documentType", "license")

      const res = await fetch(`${baseUrl}/api/uploads/document`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      })

      if (!res.ok) {
        setDocStatus("failed")
        throw new Error("Failed to upload one or more documents")
      }

      const data = await res.json()
      if (data.fileUrl) {
        documentUrls.push(data.fileUrl)
        setUploadedDocCount((prev) => prev + 1)
      }
    }

    if (documentFiles.length > 0) {
      setDocStatus("uploaded")
    } else {
      setDocStatus("idle")
    }

    return { profilePhoto, documentUrls }
  }

  if (step === 3) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-warning/15 text-warning-foreground">
          <Clock className="size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Application submitted</h1>
          <p className="text-sm text-muted-foreground">
            Your credentials are under review. Our clinical team verifies all licenses before granting access.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card p-5 text-left">
          {[
            { label: "Application received", done: true },
            { label: "Credential verification", done: false, active: true },
            { label: "Admin approval", done: false },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              {s.done ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : (
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                    s.active ? "border-warning text-warning-foreground" : "border-border text-muted-foreground",
                  )}
                />
              )}
              <span className={cn("text-sm", s.done ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
              {s.active ? (
                <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                  Pending
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <Link href="/login">
          <Button variant="outline" className="w-full bg-transparent">
            Return to sign in
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to sign in
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Therapist registration</h1>
        <p className="text-sm text-muted-foreground">Join the Moody clinical network. All applications are verified.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: "Profile", icon: User },
          { n: 2, label: "Credentials", icon: BadgeCheck },
        ].map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                step >= s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <s.icon className="size-4" />
            </div>
            <span className={cn("text-sm font-medium", step >= s.n ? "text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i === 0 ? <div className="h-px flex-1 bg-border" /> : null}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === 1 ? (
        <form
          key="register-step-1"
          onSubmit={(e) => {
            e.preventDefault()
            setStep(2)
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Dr. Jane Doe"
              className="bg-card"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                value={formData.email ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                type="email"
                required
                placeholder="you@clinic.com"
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                value={formData.password ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                type="password"
                required
                placeholder="Choose a secure password"
                className="bg-card"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              type="tel"
              required
              placeholder="+1 (555) 000-0000"
              className="bg-card"
            />
          </div>
          <div className="space-y-2">
            <Label>Profile photo</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30">
              <Upload className="size-4" />
              Upload a professional headshot
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0] || null
                  setProfilePhotoFile(selectedFile)
                  setPhotoStatus(selectedFile ? "selected" : "idle")
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {photoStatus === "uploaded"
                ? "Profile photo uploaded"
                : photoStatus === "uploading"
                  ? "Uploading profile photo..."
                  : photoStatus === "failed"
                    ? "Profile photo upload failed"
                    : profilePhotoFile
                      ? `Selected: ${profilePhotoFile.name}`
                      : "No profile photo selected"}
            </p>
          </div>
          <Button type="submit" className="w-full" size="lg">
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </form>
      ) : (
        <form
          key="register-step-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setError("")
            setLoading(true)

            try {
              const form = new FormData(e.currentTarget)
              const qual = form.get("qual") as string
              const lic = form.get("license") as string
              const exp = form.get("exp") as string
              const bio = form.get("bio") as string

              // 1. Create Firebase Auth user
              const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password)

              // 2. Upload optional profile photo and documents.
              const idToken = await userCred.user.getIdToken()
              const { profilePhoto, documentUrls } = await uploadRegistrationFiles(idToken)

              // 3. Call backend to set custom claims and persist therapist profile.
              try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/set-claims`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({
                    uid: userCred.user.uid,
                    role: "therapist",
                    verified: false,
                    status: "pending_verification",
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone,
                    qualifications: qual,
                    licenseNumber: lic,
                    yearsOfExperience: parseInt(exp, 10),
                    bio,
                    specializations: selected,
                    profilePhoto,
                    documentUrls,
                  }),
                })

                if (!response.ok) {
                  const errData = await response.json().catch(() => ({}))
                  throw new Error(errData.detail || "Failed to save therapist profile")
                }
              } catch (err) {
                console.warn('Could not set custom claims:', err)
                throw err
              }

              setStep(3)
            } catch (err: any) {
              // Map Firebase error codes to user-friendly messages
              let message = err.message || "Failed to create account"
              
              if (err.code === "auth/configuration-not-found") {
                message = "Firebase is not properly configured. Please check the admin console."
              } else if (err.code === "auth/email-already-in-use") {
                message = "An account with this email already exists. Please sign in instead."
              } else if (err.code === "auth/invalid-email") {
                message = "Please enter a valid email address."
              } else if (err.code === "auth/weak-password") {
                message = "Password must be at least 6 characters long."
              } else if (err.code === "auth/operation-not-allowed") {
                message = "Email/password signup is not enabled. Please contact support."
              } else if (err.code === "auth/too-many-requests") {
                message = "Too many signup attempts. Please try again later."
              }
              
              setError(message)
            } finally {
              setLoading(false)
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="qual">Qualifications</Label>
            <Input id="qual" name="qual" required placeholder="Ph.D. Clinical Psychology, LCSW" className="bg-card" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="license">License number</Label>
              <Input id="license" name="license" required placeholder="PSY-00000-XX" className="bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp">Years of experience</Label>
              <Input id="exp" name="exp" type="number" min={0} required placeholder="8" className="bg-card" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Specializations</Label>
            <div className="flex flex-wrap gap-2">
              {specializationOptions.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSpec(s)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    selected.includes(s)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Professional bio</Label>
            <Textarea id="bio" name="bio" rows={3} placeholder="Briefly describe your clinical approach..." className="bg-card" />
          </div>

          <div className="space-y-2">
            <Label>License documents</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30">
              <FileText className="size-4" />
              Upload license &amp; certification (PDF)
              <input
                type="file"
                accept=".pdf,.png,.jpg"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const selectedFiles = Array.from(e.target.files || [])
                  setDocumentFiles(selectedFiles)
                  setDocStatus(selectedFiles.length > 0 ? "selected" : "idle")
                  setUploadedDocCount(0)
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {docStatus === "uploaded"
                ? `Documents uploaded (${uploadedDocCount}/${documentFiles.length})`
                : docStatus === "uploading"
                  ? `Uploading documents (${uploadedDocCount}/${documentFiles.length})...`
                  : docStatus === "failed"
                    ? "Document upload failed"
                    : documentFiles.length > 0
                      ? `${documentFiles.length} document(s) selected`
                      : "No documents selected"}
            </p>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Submitting..." : "Submit for verification"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
