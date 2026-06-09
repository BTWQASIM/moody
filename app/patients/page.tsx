"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { PortalShell } from "@/components/portal-shell"
import { ProtectedRoute } from "@/app/protected-route"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { RiskBadge } from "@/components/status-badges"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePatients, useUpdatePatient, useCreatePatient } from "@/lib/hooks"
import {
  Search,
  Plus,
  Calendar,
  Mail,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

const ITEMS_PER_PAGE = 12

function PatientsContent() {
  const { data: patients, loading, error } = usePatients()
  const { execute: createPatient, loading: creating } = useCreatePatient()
  const { execute: updatePatient, loading: updating } = useUpdatePatient()

  const [query, setQuery] = useState("")
  const [riskFilter, setRiskFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [isNewPatientOpen, setIsNewPatientOpen] = useState(false)
  const [newPatientForm, setNewPatientForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
  })

  const patientList = patients || []

  const filtered = useMemo(() => {
    return patientList.filter((p: any) => {
      const fullName = `${p.firstName} ${p.lastName}`.toLowerCase()
      const matchesQuery = fullName.includes(query.toLowerCase()) ||
        p.email.toLowerCase().includes(query.toLowerCase())
      const matchesRisk = riskFilter === "all" || p.riskLevel === riskFilter
      const matchesStatus = statusFilter === "all" || p.status === statusFilter
      return matchesQuery && matchesRisk && matchesStatus
    })
  }, [patientList, query, riskFilter, statusFilter])

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedPatients = filtered.slice(
    startIdx,
    startIdx + ITEMS_PER_PAGE
  )

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !newPatientForm.firstName ||
      !newPatientForm.lastName ||
      !newPatientForm.email
    ) {
      return
    }

    await createPatient({
      firstName: newPatientForm.firstName,
      lastName: newPatientForm.lastName,
      email: newPatientForm.email,
      phoneNumber: newPatientForm.phoneNumber,
      status: "new",
    })

    setNewPatientForm({ firstName: "", lastName: "", email: "", phoneNumber: "" })
    setIsNewPatientOpen(false)
  }

  const PatientCardSkeleton = () => (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-12" />
      </div>
    </Card>
  )

  return (
    <PortalShell
      title="Patient Directory"
      subtitle={`${patientList.length} patients under your care`}
    >
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load patients. Please try again.</span>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={riskFilter} onValueChange={(v) => {
              setRiskFilter(v)
              setCurrentPage(1)
            }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isNewPatientOpen} onOpenChange={setIsNewPatientOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Patient
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Patient</DialogTitle>
                  <DialogDescription>
                    Create a new patient profile
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreatePatient} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        value={newPatientForm.firstName}
                        onChange={(e) =>
                          setNewPatientForm({
                            ...newPatientForm,
                            firstName: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        value={newPatientForm.lastName}
                        onChange={(e) =>
                          setNewPatientForm({
                            ...newPatientForm,
                            lastName: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      value={newPatientForm.email}
                      onChange={(e) =>
                        setNewPatientForm({
                          ...newPatientForm,
                          email: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone (Optional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={newPatientForm.phoneNumber}
                      onChange={(e) =>
                        setNewPatientForm({
                          ...newPatientForm,
                          phoneNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={creating || !newPatientForm.firstName ||
                      !newPatientForm.lastName ||
                      !newPatientForm.email}
                    className="w-full"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Patient"
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PatientCardSkeleton key={i} />
          ))}
        </div>
      ) : paginatedPatients.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">
            {filtered.length === 0
              ? "No patients match your filters."
              : "No patients found."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedPatients.map((p: any) => (
              <Link key={p.id} href={`/patients/${p.id}`}>
                <Card className="h-full p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-12">
                      <AvatarImage
                        src={p.profilePhoto || "/placeholder.svg"}
                        alt={`${p.firstName} ${p.lastName}`}
                      />
                      <AvatarFallback>
                        {p.firstName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold text-foreground">
                          {`${p.firstName} ${p.lastName}`}
                        </p>
                        <RiskBadge level={p.riskLevel || "low"} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.email}
                      </p>
                      {p.phoneNumber && (
                        <p className="text-xs text-muted-foreground">
                          {p.phoneNumber}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="size-3.5" />
                      {new Date(p.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span
                      className={`text-xs font-medium rounded px-2 py-1 ${
                        p.status === "active"
                          ? "bg-green-100 text-green-700"
                          : p.status === "new"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setCurrentPage(Math.max(1, currentPage - 1))
                }
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <Button
                    key={i}
                    variant={
                      currentPage === i + 1 ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setCurrentPage(i + 1)}
                  >
                    {i + 1}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </PortalShell>
  )
}

export default function PatientsPage() {
  return (
    <ProtectedRoute>
      <PatientsContent />
    </ProtectedRoute>
  )
}
