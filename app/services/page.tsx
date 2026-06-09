"use client"

import { useState } from "react"
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
import { services as initialServices, type Service } from "@/lib/data"
import { Plus, Clock, DollarSign, Tag, Stethoscope } from "lucide-react"

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>(initialServices)

  function toggle(id: string) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)))
  }

  return (
    <PortalShell title="Services Management" subtitle="Define the therapy services you offer to patients">
      <div className="mb-4 flex justify-end">
        <CreateServiceDialog onCreate={(s) => setServices((prev) => [...prev, s])} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((s) => (
          <Card key={s.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Stethoscope className="size-5" />
              </div>
              <Switch checked={s.active} onCheckedChange={() => toggle(s.id)} />
            </div>
            <h3 className="mt-3 font-semibold text-foreground">{s.name}</h3>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {s.duration} min
              </span>
              <span className="flex items-center gap-1.5">
                <DollarSign className="size-3.5" />${s.fee}
              </span>
              <Badge variant="outline" className="ml-auto gap-1">
                <Tag className="size-3" />
                {s.specialization}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </PortalShell>
  )
}

function CreateServiceDialog({ onCreate }: { onCreate: (s: Service) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", duration: "50", fee: "175", specialization: "" })

  function submit() {
    if (!form.name) return
    onCreate({
      id: `s${Date.now()}`,
      name: form.name,
      description: form.description,
      duration: Number(form.duration),
      fee: Number(form.fee),
      specialization: form.specialization || "General",
      active: true,
    })
    setForm({ name: "", description: "", duration: "50", fee: "175", specialization: "" })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New Service
        </Button>
      </DialogTrigger>
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
          <Button onClick={submit}>Create Service</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
