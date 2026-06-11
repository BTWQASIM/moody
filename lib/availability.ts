export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const

export type DayAvailability = {
  day: string
  enabled: boolean
  start: string
  end: string
}

export type MobileAvailabilitySlot = {
  dayOfWeek: number
  startTime: string
  endTime: string
}

/** Matches Flutter `date.weekday % 7` (Mon=1 … Sat=6, Sun=0). */
export function dayNameToDayOfWeek(day: string): number {
  const index = WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number])
  if (index < 0) return 0
  return index === 6 ? 0 : index + 1
}

export function dayOfWeekToDayName(dayOfWeek: number): string {
  if (dayOfWeek === 0) return "Sunday"
  return WEEKDAYS[dayOfWeek - 1]
}

export function defaultWeeklyAvailability(): DayAvailability[] {
  return WEEKDAYS.map((day, index) => ({
    day,
    enabled: index < 5,
    start: "09:00",
    end: "17:00",
  }))
}

export function toMobileAvailability(slots: DayAvailability[]): MobileAvailabilitySlot[] {
  return slots
    .filter((slot) => slot.enabled)
    .map((slot) => ({
      dayOfWeek: dayNameToDayOfWeek(slot.day),
      startTime: slot.start,
      endTime: slot.end,
    }))
}

export function fromStoredAvailability(raw: unknown): DayAvailability[] {
  const defaults = defaultWeeklyAvailability()
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaults
  }

  if (raw.some((entry) => typeof (entry as { dayOfWeek?: unknown })?.dayOfWeek === "number")) {
    return defaults.map((dayEntry) => {
      const match = raw.find(
        (entry) =>
          (entry as { dayOfWeek?: number })?.dayOfWeek === dayNameToDayOfWeek(dayEntry.day),
      ) as { startTime?: string; endTime?: string } | undefined

      if (!match) {
        return { ...dayEntry, enabled: false }
      }

      return {
        day: dayEntry.day,
        enabled: true,
        start: typeof match.startTime === "string" ? match.startTime : "09:00",
        end: typeof match.endTime === "string" ? match.endTime : "17:00",
      }
    })
  }

  return defaults.map((dayEntry) => {
    const match = raw.find((entry) => (entry as { day?: string })?.day === dayEntry.day) as
      | { enabled?: boolean; start?: string; end?: string }
      | undefined

    if (!match) {
      return dayEntry
    }

    return {
      day: dayEntry.day,
      enabled: Boolean(match.enabled ?? true),
      start: typeof match.start === "string" ? match.start : "09:00",
      end: typeof match.end === "string" ? match.end : "17:00",
    }
  })
}

export function hasEnabledAvailability(slots: DayAvailability[]): boolean {
  return slots.some(
    (slot) => slot.enabled && slot.start && slot.end && slot.start < slot.end,
  )
}
