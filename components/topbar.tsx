"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Search, Bell, Menu } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/app/providers"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar } from "@/components/sidebar"
import { terminatePortalSession } from "@/lib/auth-session"
import { useNotifications } from "@/lib/hooks"

type TherapistProfile = {
  name?: string
  title?: string
  profilePhoto?: string
  email?: string
}

function resolveProfilePhotoUrl(photo: string | undefined, fallback: string) {
  if (!photo) return fallback
  if (photo.startsWith("http://") || photo.startsWith("https://")) return photo

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  if (photo.startsWith("/uploads/")) {
    return `${apiBase}${photo}`
  }

  if (photo.startsWith("uploads/")) {
    return `${apiBase}/${photo}`
  }

  if (photo.startsWith("profile-photos/") || photo.startsWith("documents/")) {
    return `${apiBase}/uploads/${photo}`
  }

  return photo
}

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, role, verified } = useAuth()
  const [profile, setProfile] = useState<TherapistProfile | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const { data: notifications } = useNotifications()
  const unreadCount = ((notifications as Array<{ isRead?: boolean }> | null) || [])
    .filter((notification) => !notification.isRead).length

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (!user) {
        setProfile(null)
        return
      }

      try {
        const idToken = await user.getIdToken()
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        const response = await fetch(`${apiBase}/api/auth/profile`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        })

        if (!response.ok) {
          throw new Error("Failed to load profile")
        }

        const result = await response.json()
        if (cancelled) return
        setProfile((result?.profile as TherapistProfile) || null)
      } catch {
        if (!cancelled) {
          setProfile(null)
        }
      }
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [user, pathname])

  const displayName = role === "admin"
    ? user?.displayName || profile?.name || "Admin"
    : profile?.name || user?.displayName || "Therapist"
  const displayTitle = role === "admin" ? "System Administrator" : profile?.title || "Licensed Therapist"
  const displayEmail = profile?.email || user?.email || ""
  const displayAvatar = resolveProfilePhotoUrl(
    profile?.profilePhoto,
    user?.photoURL || "/placeholder.svg",
  )
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "TH"

  async function handleSignOut() {
    await terminatePortalSession()
    router.replace("/login")
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault()
    const term = searchQuery.trim()

    if (!term) {
      if (role === "admin") {
        router.push("/admin/therapists")
      }
      return
    }

    if (role === "admin") {
      router.push(`/admin/therapists?q=${encodeURIComponent(term)}`)
    } else {
      router.push(`/patients?q=${encodeURIComponent(term)}`)
    }
  }

  const searchPlaceholder = useMemo(() => {
    if (role === "admin") {
      return "Search therapists by name, email, phone..."
    }
    return "Search patients, notes..."
  }, [role])

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md md:px-6">
      <Sheet>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          }
        />
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold text-foreground md:text-xl">{title}</h1>
        {subtitle ? <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p> : null}
      </div>

      <form className="relative hidden lg:block" onSubmit={handleSearchSubmit}>
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          className="w-72 bg-card pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </form>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => router.push("/notifications")}
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" /> : null}
        <span className="sr-only">Notifications</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-full pl-1 pr-3 outline-none ring-ring focus-visible:ring-2"
            >
              <Avatar className="size-8">
                <AvatarImage src={displayAvatar} alt={displayName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{displayTitle}</p>
              </div>
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>My Account</span>
                  <Badge
                    variant="outline"
                    className={
                      role === "admin"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : verified
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-warning/30 bg-warning/10 text-warning"
                    }
                  >
                    {role === "admin" ? "Admin" : verified ? "Verified" : "Pending"}
                  </Badge>
                </div>
                {displayEmail ? <p className="text-xs text-muted-foreground">{displayEmail}</p> : null}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(role === "admin" ? "/admin/settings" : "/settings")}>Profile &amp; Settings</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(role === "admin" ? "/admin/settings" : "/settings")}>Availability</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(role === "admin" ? "/admin/settings" : "/settings")}>Security</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
