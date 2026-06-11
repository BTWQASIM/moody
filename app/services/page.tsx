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
import { Plus, Clock, DollarSign, Tag, Stethoscope } from "lucide-react"

export default function ServicesPage() {
  return (
    <ProtectedRoute allowedRoles={["therapist"]} requireVerified>
      <ServicesPageContent />
    </ProtectedRoute>
  )
}

function ServicesPageContent() {
  const { data, loading, error } = useServices()
  const [submitting, setSubmitting] = useState(false)

  const services = (data || []) as Array<{
    id: string
    name: string
    description: string
    duration: number
    price: number
    isActive?: boolean
    specialization?: string
  }>

  async function toggle(service: {
    id: string
    name: string
    description: string
    duration: number
    price: number
    isActive?: boolean
  }) {
    await serviceAPI.update(service.id, {
      isActive: !service.isActive,
    })
    window.location.reload()
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
              window.location.reload()
            } finally {
              setSubmitting(false)
            }
          }}
        />
      </div>

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
  }) => Promise<void>
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", duration: "50", fee: "175", specialization: "" })

  async function submit() {
    if (!form.name) return
    await onCreate({
      name: form.name,
      description: form.description,
      duration: Number(form.duration),
      price: Number(form.fee),
    })
    setForm({ name: "", description: "", duration: "50", fee: "175", specialization: "" })
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
