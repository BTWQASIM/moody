"use client"

import { useState } from "react"
import { ProtectedRoute } from "@/app/protected-route"
import { PortalShell } from "@/components/portal-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useServices } from "@/lib/hooks"
import { serviceAPI } from "@/lib/api"
import { Plus, Clock, DollarSign, Tag, Stethoscope, Pencil, Trash2 } from "lucide-react"

type ServiceRecord = {
  id: string
  name: string
  description: string
  duration: number
  price: number
  isActive?: boolean
  specialization?: string
  deliveryMode?: string
}

export default function ServicesPage() {
  return (
    <ProtectedRoute allowedRoles={["therapist"]} requireVerified>
      <ServicesPageContent />
    </ProtectedRoute>
  )
}

function ServicesPageContent() {
  const { data, loading, error, refetch } = useServices()
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const services = (data || []) as ServiceRecord[]

  async function toggle(service: {
    id: string
    name: string
    description: string
    duration: number
    price: number
    isActive?: boolean
  }) {
    setActionError(null)
    try {
      await serviceAPI.update(service.id, { isActive: !service.isActive })
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update service")
    }
  }

  return (
    <PortalShell title="Services Management" subtitle="Define the therapy services you offer to patients">
      <div className="mb-4 flex justify-end">
        <CreateServiceDialog
          busy={submitting}
          onCreate={async (payload) => {
            setSubmitting(true)
            try {
              await serviceAPI.create(payload)
              await refetch()
            } catch (err) {
              setActionError(err instanceof Error ? err.message : "Failed to create service")
              throw err
            } finally {
              setSubmitting(false)
            }
          }}
        />
      </div>

      {actionError ? <Card className="mb-4 p-4 text-sm text-destructive">{actionError}</Card> : null}

      {loading && (
        <Card className="p-6 text-sm text-muted-foreground">Loading services...</Card>
      )}

      {error && (
        <Card className="p-6 text-sm text-destructive">Failed to load services.</Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((s) => (
          <Card key={s.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Stethoscope className="size-5" />
              </div>
              <Switch
                checked={Boolean(s.isActive)}
                onCheckedChange={() => void toggle(s)}
              />
            </div>
            <h3 className="mt-3 font-semibold text-foreground">{s.name}</h3>
            {!s.isActive ? <Badge variant="outline" className="mt-2 w-fit">Inactive</Badge> : null}
            <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {s.duration} min
              </span>
              <span className="flex items-center gap-1.5">
                <DollarSign className="size-3.5" />${s.price}
              </span>
              <Badge variant="outline" className="ml-auto gap-1">
                <Tag className="size-3" />
                {s.specialization || "General"}
              </Badge>
              <Badge variant="outline">{s.deliveryMode || "Online"}</Badge>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <EditServiceDialog
                service={s}
                busy={submitting}
                onSave={async (payload) => {
                  setSubmitting(true)
                  setActionError(null)
                  try {
                    await serviceAPI.update(s.id, payload)
                    await refetch()
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "Failed to update service")
                    throw err
                  } finally {
                    setSubmitting(false)
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={submitting || !s.isActive}
                onClick={() => {
                  if (!window.confirm(`Deactivate ${s.name}?`)) return
                  setSubmitting(true)
                  setActionError(null)
                  void serviceAPI.delete(s.id)
                    .then(() => refetch())
                    .catch((err) => setActionError(err instanceof Error ? err.message : "Failed to deactivate service"))
                    .finally(() => setSubmitting(false))
                }}
              >
                <Trash2 className="size-3.5" />
                Deactivate
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </PortalShell>
  )
}

function CreateServiceDialog({
  onCreate,
  busy,
}: {
  onCreate: (s: {
    name: string
    description: string
    duration: number
    price: number
    specialization?: string
    deliveryMode?: string
  }) => Promise<void>
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", duration: "50", fee: "175", specialization: "", deliveryMode: "Online" })

  async function submit() {
    if (!form.name) return
    try {
      await onCreate({
        name: form.name,
        description: form.description,
        duration: Number(form.duration),
        price: Number(form.fee),
        specialization: form.specialization.trim() || undefined,
        deliveryMode: form.deliveryMode,
      })
    } catch {
      return
    }
    setForm({ name: "", description: "", duration: "50", fee: "175", specialization: "", deliveryMode: "Online" })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
        <Button>
          <Plus className="size-4" />
          New Service
        </Button>
      }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Service</DialogTitle>
          <DialogDescription>Add a therapy service that patients can book.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Service Name</Label>
            <Input
              id="name"
              placeholder="e.g. Trauma-Focused Therapy"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delivery-mode">Delivery Mode</Label>
            <select id="delivery-mode" className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value })}>
              <option value="Online">Online</option><option value="In person">In person</option><option value="Hybrid">Hybrid</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              placeholder="Describe the service..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dur">Duration (min)</Label>
              <Input
                id="dur"
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee">Fee ($)</Label>
              <Input
                id="fee"
                type="number"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spec">Specialization</Label>
              <Input
                id="spec"
                placeholder="Anxiety"
                value={form.specialization}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Creating..." : "Create Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditServiceDialog({
  service,
  onSave,
  busy,
}: {
  service: ServiceRecord
  onSave: (updates: Omit<ServiceRecord, "id" | "isActive">) => Promise<void>
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: service.name,
    description: service.description,
    duration: String(service.duration),
    price: String(service.price),
    specialization: service.specialization || "",
    deliveryMode: service.deliveryMode || "Online",
  })

  async function submit() {
    if (!form.name.trim() || Number(form.duration) <= 0 || Number(form.price) < 0) return
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        duration: Number(form.duration),
        price: Number(form.price),
        specialization: form.specialization.trim() || undefined,
        deliveryMode: form.deliveryMode,
      })
    } catch {
      return
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline"><Pencil className="size-3.5" />Edit</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Service</DialogTitle>
          <DialogDescription>Update the service patients can book.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor={`edit-name-${service.id}`}>Service Name</Label><Input id={`edit-name-${service.id}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`edit-desc-${service.id}`}>Description</Label><Textarea id={`edit-desc-${service.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label htmlFor={`edit-duration-${service.id}`}>Duration</Label><Input id={`edit-duration-${service.id}`} type="number" min={1} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-price-${service.id}`}>Fee</Label><Input id={`edit-price-${service.id}`} type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor={`edit-specialization-${service.id}`}>Specialization</Label><Input id={`edit-specialization-${service.id}`} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`edit-mode-${service.id}`}>Delivery Mode</Label><select id={`edit-mode-${service.id}`} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value })}><option value="Online">Online</option><option value="In person">In person</option><option value="Hybrid">Hybrid</option></select></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
