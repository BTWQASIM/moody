import { Lora, Outfit } from "next/font/google"
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
})

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
})

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${outfit.variable} ${lora.variable} min-h-screen w-full flex`}
      style={{ fontFamily: "var(--font-outfit), sans-serif" }}
    >
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  )
}
