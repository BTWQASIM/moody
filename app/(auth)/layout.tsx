import { HeartPulse, ShieldCheck, Sparkles, Activity } from "lucide-react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex xl:w-[40%]">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary-foreground/15">
            <HeartPulse className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Moody</p>
            <p className="text-xs text-primary-foreground/70">Therapist Portal</p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-balance text-3xl font-semibold leading-tight">
            Clinical care, supported by intelligent insight.
          </h2>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-primary-foreground/80">
            Monitor patient wellbeing in real time, automate session documentation, and
            catch early warning signs before they escalate.
          </p>
          <ul className="space-y-3">
            {[
              { icon: Activity, text: "Proactive risk monitoring across your caseload" },
              { icon: Sparkles, text: "AI-generated clinical summaries from any source" },
              { icon: ShieldCheck, text: "Secure workflows built for mental health teams" },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/15">
                  <f.icon className="size-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/60">
          Part of the Moody mental-health ecosystem &middot; Connected to the Moody patient app
        </p>
      </div>

      {/* Form area */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
