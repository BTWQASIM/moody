"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Heart, Shield, Sparkles, Activity } from "lucide-react"

const BLUE = "#2d74ba"
const BLUE_DARK = "#1e4a6e"
const BLUE_MID = "#2460a0"

const features = [
  {
    icon: Heart,
    title: "Proactive risk monitoring",
    desc: "Track patient wellbeing across your entire caseload in real time.",
  },
  {
    icon: Sparkles,
    title: "AI-generated clinical summaries",
    desc: "Synthesize notes and history from any source automatically.",
  },
  {
    icon: Shield,
    title: "Secure team workflows",
    desc: "Built specifically for mental health care teams.",
  },
  {
    icon: Activity,
    title: "Early warning detection",
    desc: "Catch escalation signals before they become crises.",
  },
]

const floatingOrbs = [
  { size: 340, x: -80, y: -60, delay: 0, color: "rgba(80,160,220,0.22)" },
  { size: 220, x: 60, y: 200, delay: 1.2, color: "rgba(30,90,160,0.18)" },
  { size: 180, x: 180, y: 360, delay: 2.4, color: "rgba(80,160,220,0.14)" },
  { size: 260, x: -40, y: 340, delay: 0.8, color: "rgba(30,90,160,0.12)" },
]

export function AuthBrandPanel() {
  const [mounted, setMounted] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)

  useEffect(() => {
    setMounted(true)
    const interval = setInterval(() => {
      setActiveFeature((p) => (p + 1) % features.length)
    }, 3200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className="relative hidden lg:flex flex-col justify-between overflow-hidden"
      style={{
        width: "52%",
        background: `linear-gradient(145deg, ${BLUE_DARK} 0%, ${BLUE_MID} 35%, ${BLUE} 60%, #3a8ac4 100%)`,
      }}
    >
      {floatingOrbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: `radial-gradient(circle, ${orb.color}, transparent 70%)`,
          }}
          animate={{ y: [0, -24, 0], x: [0, 10, 0], scale: [1, 1.06, 1] }}
          transition={{
            duration: 7 + i * 1.2,
            delay: orb.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M30 0C13.4 0 0 13.4 0 30s13.4 30 30 30 30-13.4 30-30S46.6 0 30 0zm0 56C15.6 56 4 44.4 4 30S15.6 4 30 4s26 11.6 26 26-11.6 26-26 26z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: "60px 60px",
        }}
      />

      <motion.div
        className="relative z-10 p-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : -20 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <Heart size={17} className="text-white" />
          </div>
          <div>
            <div
              className="text-white font-semibold text-base leading-none"
              style={{ fontFamily: "var(--font-lora), serif", letterSpacing: "0.02em" }}
            >
              Moody
            </div>
            <div className="text-white/60 text-xs mt-0.5 font-light tracking-wide">
              Therapist Portal
            </div>
          </div>
        </div>
      </motion.div>

      <div className="relative z-10 px-10 pb-6 flex-1 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
          transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
        >
          <p
            className="text-white/55 text-sm font-medium tracking-widest uppercase mb-4"
            style={{ letterSpacing: "0.18em" }}
          >
            Clinical Care
          </p>
          <h1
            className="text-white leading-[1.15] mb-6"
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: "clamp(2rem, 3.2vw, 2.75rem)",
              fontWeight: 500,
            }}
          >
            Clinical care,
            <br />
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>supported by</em>
            <br />
            intelligent insight.
          </h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-sm font-light">
            Monitor patient wellbeing in real time, automate session documentation, and
            catch early warning signs before they escalate.
          </p>
        </motion.div>

        <motion.div
          className="mt-10 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: mounted ? 1 : 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          {features.map((f, i) => {
            const Icon = f.icon
            const isActive = activeFeature === i
            return (
              <motion.div
                key={f.title}
                className="flex items-start gap-3.5 rounded-2xl px-4 py-3.5 cursor-pointer"
                style={{
                  background: isActive
                    ? "rgba(255,255,255,0.16)"
                    : "rgba(255,255,255,0.06)",
                  border: isActive
                    ? "1px solid rgba(255,255,255,0.22)"
                    : "1px solid transparent",
                  backdropFilter: isActive ? "blur(8px)" : "none",
                  transition: "background 0.4s, border 0.4s",
                }}
                animate={{ scale: isActive ? 1.01 : 1 }}
                transition={{ duration: 0.3 }}
                onClick={() => setActiveFeature(i)}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                >
                  <Icon size={15} className="text-white/90" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{f.title}</p>
                  <AnimatePresence>
                    {isActive && (
                      <motion.p
                        className="text-white/65 text-xs leading-relaxed mt-0.5 font-light"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        {f.desc}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      <motion.div
        className="relative z-10 px-10 py-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: mounted ? 1 : 0 }}
        transition={{ duration: 0.8, delay: 0.9 }}
      >
        <p className="text-white/40 text-xs font-light">
          Part of the Moody mental-health ecosystem &middot; Connected to the Moody patient
          app
        </p>
      </motion.div>
    </div>
  )
}
