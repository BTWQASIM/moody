export type RiskLevel = "low" | "medium" | "high" | "critical"
export type MoodTrend = "improving" | "stable" | "declining"
export type PatientStatus = "active" | "inactive" | "new"
export type AppointmentStatus = "confirmed" | "pending" | "completed" | "cancelled"
export type AlertSeverity = "info" | "warning" | "critical"

export interface Patient {
  id: string
  name: string
  age: number
  avatar: string
  riskLevel: RiskLevel
  riskScore: number
  status: PatientStatus
  moodTrend: MoodTrend
  therapyType: string
  assignedDate: string
  lastActivity: string
  email: string
  phone: string
  emergencyContact: { name: string; relation: string; phone: string }
  treatmentPlan: string
  diagnosis: string
  sessions: number
}

export interface RiskAlert {
  id: string
  patientId: string
  patientName: string
  patientAvatar: string
  severity: AlertSeverity
  title: string
  explanation: string
  suggestedAction: string
  time: string
}

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  patientAvatar: string
  type: string
  date: string
  time: string
  duration: number
  status: AppointmentStatus
}

export interface SessionNote {
  id: string
  patientId: string
  patientName: string
  title: string
  date: string
  source: "audio" | "pdf" | "docx" | "text"
  riskAssessment: RiskLevel
  preview: string
}

export interface Service {
  id: string
  name: string
  description: string
  duration: number
  fee: number
  specialization: string
  active: boolean
}

export const therapist = {
  name: "Dr. Elena Hart",
  title: "Licensed Clinical Psychologist",
  email: "elena.hart@moodyhealth.io",
  avatar: "/therapist-avatar.png",
  license: "PSY-29481-CA",
  status: "approved" as "pending" | "approved" | "rejected",
}

export const patients: Patient[] = [
  {
    id: "p1",
    name: "Marcus Reed",
    age: 34,
    avatar: "/patient-marcus.png",
    riskLevel: "critical",
    riskScore: 92,
    status: "active",
    moodTrend: "declining",
    therapyType: "Depression Counseling",
    assignedDate: "2024-11-02",
    lastActivity: "12 min ago",
    email: "marcus.reed@email.com",
    phone: "+1 (415) 555-0142",
    emergencyContact: { name: "Sarah Reed", relation: "Spouse", phone: "+1 (415) 555-0143" },
    treatmentPlan: "Weekly CBT sessions with focus on cognitive restructuring and behavioral activation.",
    diagnosis: "Major Depressive Disorder, recurrent",
    sessions: 14,
  },
  {
    id: "p2",
    name: "Aisha Okafor",
    age: 27,
    avatar: "/patient-aisha.png",
    riskLevel: "high",
    riskScore: 78,
    status: "active",
    moodTrend: "declining",
    therapyType: "Anxiety Therapy",
    assignedDate: "2024-09-18",
    lastActivity: "1 hour ago",
    email: "aisha.okafor@email.com",
    phone: "+1 (628) 555-0188",
    emergencyContact: { name: "David Okafor", relation: "Brother", phone: "+1 (628) 555-0189" },
    treatmentPlan: "Exposure therapy combined with mindfulness-based stress reduction.",
    diagnosis: "Generalized Anxiety Disorder",
    sessions: 22,
  },
  {
    id: "p3",
    name: "Liam Chen",
    age: 19,
    avatar: "/patient-liam.png",
    riskLevel: "high",
    riskScore: 71,
    status: "active",
    moodTrend: "stable",
    therapyType: "PTSD Treatment",
    assignedDate: "2025-01-10",
    lastActivity: "3 hours ago",
    email: "liam.chen@email.com",
    phone: "+1 (510) 555-0177",
    emergencyContact: { name: "Grace Chen", relation: "Mother", phone: "+1 (510) 555-0178" },
    treatmentPlan: "Trauma-focused CBT with gradual exposure and grounding techniques.",
    diagnosis: "Post-Traumatic Stress Disorder",
    sessions: 8,
  },
  {
    id: "p4",
    name: "Sofia Martinez",
    age: 41,
    avatar: "/patient-sofia.png",
    riskLevel: "medium",
    riskScore: 54,
    status: "active",
    moodTrend: "improving",
    therapyType: "Addiction Recovery",
    assignedDate: "2024-07-22",
    lastActivity: "Yesterday",
    email: "sofia.martinez@email.com",
    phone: "+1 (415) 555-0210",
    emergencyContact: { name: "Carlos Martinez", relation: "Husband", phone: "+1 (415) 555-0211" },
    treatmentPlan: "Relapse prevention plan with weekly check-ins and group support referral.",
    diagnosis: "Substance Use Disorder, in early remission",
    sessions: 31,
  },
  {
    id: "p5",
    name: "Noah Williams",
    age: 23,
    avatar: "/patient-noah.png",
    riskLevel: "medium",
    riskScore: 48,
    status: "active",
    moodTrend: "improving",
    therapyType: "Anxiety Therapy",
    assignedDate: "2024-12-05",
    lastActivity: "2 days ago",
    email: "noah.williams@email.com",
    phone: "+1 (650) 555-0166",
    emergencyContact: { name: "Emma Williams", relation: "Sister", phone: "+1 (650) 555-0167" },
    treatmentPlan: "Skills-based therapy targeting social anxiety with weekly exposure goals.",
    diagnosis: "Social Anxiety Disorder",
    sessions: 11,
  },
  {
    id: "p6",
    name: "Priya Patel",
    age: 30,
    avatar: "/patient-priya.png",
    riskLevel: "low",
    riskScore: 22,
    status: "active",
    moodTrend: "improving",
    therapyType: "Depression Counseling",
    assignedDate: "2024-05-14",
    lastActivity: "4 days ago",
    email: "priya.patel@email.com",
    phone: "+1 (408) 555-0133",
    emergencyContact: { name: "Anil Patel", relation: "Father", phone: "+1 (408) 555-0134" },
    treatmentPlan: "Maintenance phase, biweekly sessions and mood self-monitoring.",
    diagnosis: "Persistent Depressive Disorder",
    sessions: 40,
  },
  {
    id: "p7",
    name: "Ethan Brooks",
    age: 16,
    avatar: "/patient-ethan.png",
    riskLevel: "low",
    riskScore: 18,
    status: "new",
    moodTrend: "stable",
    therapyType: "Child Psychology",
    assignedDate: "2025-02-01",
    lastActivity: "5 days ago",
    email: "guardian.brooks@email.com",
    phone: "+1 (925) 555-0155",
    emergencyContact: { name: "Laura Brooks", relation: "Mother", phone: "+1 (925) 555-0156" },
    treatmentPlan: "Play-based assessment and family-inclusive sessions.",
    diagnosis: "Adjustment Disorder",
    sessions: 2,
  },
]

export const riskAlerts: RiskAlert[] = [
  {
    id: "a1",
    patientId: "p1",
    patientName: "Marcus Reed",
    patientAvatar: "/patient-marcus.png",
    severity: "critical",
    title: "Crisis risk detected",
    explanation:
      "Journal entries over the past 48 hours contain language patterns associated with hopelessness and passive ideation. Mood score dropped 38% week-over-week.",
    suggestedAction: "Initiate same-day outreach and review safety plan.",
    time: "12 min ago",
  },
  {
    id: "a2",
    patientId: "p2",
    patientName: "Aisha Okafor",
    patientAvatar: "/patient-aisha.png",
    severity: "warning",
    title: "Sudden mood decline",
    explanation:
      "Daily check-in scores fell from 7.2 to 4.1 over five days, coinciding with reported work stressors.",
    suggestedAction: "Schedule a check-in within 24 hours.",
    time: "1 hour ago",
  },
  {
    id: "a3",
    patientId: "p3",
    patientName: "Liam Chen",
    patientAvatar: "/patient-liam.png",
    severity: "warning",
    title: "Sleep disruption pattern",
    explanation:
      "Biometric data shows average sleep dropped to 4.3 hours with frequent interruptions over 7 nights.",
    suggestedAction: "Review sleep hygiene and consider session adjustment.",
    time: "3 hours ago",
  },
  {
    id: "a4",
    patientId: "p2",
    patientName: "Aisha Okafor",
    patientAvatar: "/patient-aisha.png",
    severity: "info",
    title: "Anxiety escalation",
    explanation:
      "AI companion flagged 3 high-anxiety conversations this week with recurring panic themes.",
    suggestedAction: "Reinforce grounding techniques next session.",
    time: "Yesterday",
  },
]

export const appointments: Appointment[] = [
  { id: "ap1", patientId: "p1", patientName: "Marcus Reed", patientAvatar: "/patient-marcus.png", type: "Depression Counseling", date: "2025-02-10", time: "09:00", duration: 50, status: "confirmed" },
  { id: "ap2", patientId: "p2", patientName: "Aisha Okafor", patientAvatar: "/patient-aisha.png", type: "Anxiety Therapy", date: "2025-02-10", time: "11:00", duration: 50, status: "confirmed" },
  { id: "ap3", patientId: "p4", patientName: "Sofia Martinez", patientAvatar: "/patient-sofia.png", type: "Addiction Recovery", date: "2025-02-10", time: "14:30", duration: 60, status: "confirmed" },
  { id: "ap4", patientId: "p3", patientName: "Liam Chen", patientAvatar: "/patient-liam.png", type: "PTSD Treatment", date: "2025-02-11", time: "10:00", duration: 50, status: "pending" },
  { id: "ap5", patientId: "p5", patientName: "Noah Williams", patientAvatar: "/patient-noah.png", type: "Anxiety Therapy", date: "2025-02-12", time: "13:00", duration: 50, status: "confirmed" },
  { id: "ap6", patientId: "p7", patientName: "Ethan Brooks", patientAvatar: "/patient-ethan.png", type: "Child Psychology", date: "2025-02-12", time: "15:30", duration: 45, status: "pending" },
  { id: "ap7", patientId: "p6", patientName: "Priya Patel", patientAvatar: "/patient-priya.png", type: "Depression Counseling", date: "2025-02-13", time: "09:30", duration: 50, status: "confirmed" },
]

export const sessionNotes: SessionNote[] = [
  { id: "n1", patientId: "p1", patientName: "Marcus Reed", title: "Session 14 — Cognitive restructuring", date: "2025-02-03", source: "audio", riskAssessment: "high", preview: "Patient reported persistent low mood and reduced engagement in daily activities. Explored automatic negative thoughts..." },
  { id: "n2", patientId: "p2", patientName: "Aisha Okafor", title: "Session 22 — Exposure progress review", date: "2025-02-02", source: "text", riskAssessment: "medium", preview: "Reviewed exposure hierarchy. Patient successfully completed two mid-level exposures with reduced anticipatory anxiety..." },
  { id: "n3", patientId: "p4", patientName: "Sofia Martinez", title: "Session 31 — Relapse prevention", date: "2025-01-30", source: "pdf", riskAssessment: "low", preview: "Strong progress maintained. Patient identified high-risk situations and rehearsed coping responses..." },
  { id: "n4", patientId: "p3", patientName: "Liam Chen", title: "Session 8 — Trauma processing", date: "2025-01-28", source: "docx", riskAssessment: "high", preview: "Continued trauma-focused work. Patient tolerated narrative exposure with grounding support..." },
]

export const services: Service[] = [
  { id: "s1", name: "Anxiety Therapy", description: "Evidence-based CBT and exposure therapy for anxiety disorders.", duration: 50, fee: 180, specialization: "Anxiety", active: true },
  { id: "s2", name: "Depression Counseling", description: "Individual therapy focused on mood regulation and behavioral activation.", duration: 50, fee: 175, specialization: "Mood Disorders", active: true },
  { id: "s3", name: "PTSD Treatment", description: "Trauma-focused therapy including TF-CBT and EMDR-informed approaches.", duration: 60, fee: 210, specialization: "Trauma", active: true },
  { id: "s4", name: "Child Psychology", description: "Play-based and family-inclusive therapy for children and adolescents.", duration: 45, fee: 160, specialization: "Pediatric", active: true },
  { id: "s5", name: "Addiction Recovery", description: "Relapse prevention and motivational interviewing for substance use.", duration: 60, fee: 195, specialization: "Addiction", active: false },
]

// Chart data
export const moodTrendData = [
  { date: "Wk 1", mood: 5.2, anxiety: 6.8, depression: 6.0 },
  { date: "Wk 2", mood: 4.8, anxiety: 7.1, depression: 6.4 },
  { date: "Wk 3", mood: 5.5, anxiety: 6.2, depression: 5.6 },
  { date: "Wk 4", mood: 4.2, anxiety: 7.6, depression: 6.9 },
  { date: "Wk 5", mood: 3.8, anxiety: 8.0, depression: 7.4 },
  { date: "Wk 6", mood: 4.1, anxiety: 7.4, depression: 7.0 },
  { date: "Wk 7", mood: 3.5, anxiety: 8.2, depression: 7.8 },
  { date: "Wk 8", mood: 3.9, anxiety: 7.8, depression: 7.5 },
]

export const sleepData = [
  { date: "Mon", hours: 6.2 },
  { date: "Tue", hours: 5.4 },
  { date: "Wed", hours: 4.8 },
  { date: "Thu", hours: 4.3 },
  { date: "Fri", hours: 5.1 },
  { date: "Sat", hours: 6.0 },
  { date: "Sun", hours: 5.6 },
]

export const checkinData = [
  { date: "Wk 1", checkins: 5, journals: 3 },
  { date: "Wk 2", checkins: 6, journals: 4 },
  { date: "Wk 3", checkins: 4, journals: 2 },
  { date: "Wk 4", checkins: 7, journals: 5 },
  { date: "Wk 5", checkins: 3, journals: 1 },
  { date: "Wk 6", checkins: 6, journals: 4 },
  { date: "Wk 7", checkins: 5, journals: 3 },
  { date: "Wk 8", checkins: 7, journals: 6 },
]

export const retentionData = [
  { month: "Aug", served: 28, sessions: 92 },
  { month: "Sep", served: 32, sessions: 108 },
  { month: "Oct", served: 35, sessions: 121 },
  { month: "Nov", served: 38, sessions: 134 },
  { month: "Dec", served: 36, sessions: 118 },
  { month: "Jan", served: 41, sessions: 142 },
]

export const journalThemes = [
  { theme: "Work-related stress", count: 14, sentiment: "negative" },
  { theme: "Family relationships", count: 9, sentiment: "mixed" },
  { theme: "Self-worth", count: 11, sentiment: "negative" },
  { theme: "Coping & gratitude", count: 6, sentiment: "positive" },
  { theme: "Sleep difficulties", count: 8, sentiment: "negative" },
]

export const riskColor: Record<RiskLevel, string> = {
  low: "text-success bg-success/10 border-success/20",
  medium: "text-warning bg-warning/10 border-warning/30",
  high: "text-destructive bg-destructive/10 border-destructive/20",
  critical: "text-destructive-foreground bg-destructive border-destructive",
}
