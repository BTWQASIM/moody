"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)

  return (
    <div className="space-y-8">
      <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to sign in
      </Link>

      {sent ? (
        <div className="space-y-4 rounded-xl border border-success/20 bg-success/5 p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <h1 className="text-xl font-semibold text-foreground">Check your inbox</h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, we&apos;ve sent password reset instructions.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reset password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a secure reset link.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSent(true)
            }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" required placeholder="you@clinic.com" className="bg-card pl-9" />
              </div>
            </div>
            <Button type="submit" className="w-full" size="lg">
              Send reset link
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
