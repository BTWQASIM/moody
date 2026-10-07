import { describe, expect, it } from "vitest"

import {
  dayNameToDayOfWeek,
  dayOfWeekToDayName,
  fromStoredAvailability,
  hasEnabledAvailability,
  toMobileAvailability,
} from "./availability"
import {
  getResolvedPatientName,
  resolvePortalPatientId,
} from "./patient-mapping"
import { getPasswordValidationError, validatePassword } from "./password-policy"
import { normalizeTaskStatus } from "./task-status"

describe("password policy", () => {
  it("accepts a strong password and rejects every SRS edge case", () => {
    expect(validatePassword("N7!calmRiver")).toEqual({ valid: true, errors: [] })
    expect(getPasswordValidationError("short")).toContain("At least 8 characters")
    expect(getPasswordValidationError("Strong1 Password!")).toContain("No spaces")
    expect(getPasswordValidationError("Password1!")).toContain(
      "No common password words",
    )
  })
})

describe("availability integration contract", () => {
  it("round-trips the Flutter weekday convention without enabling missing days", () => {
    const mobile = toMobileAvailability([
      { day: "Monday", enabled: true, start: "08:30", end: "12:30" },
      { day: "Tuesday", enabled: false, start: "09:00", end: "17:00" },
      { day: "Sunday", enabled: true, start: "10:00", end: "14:00" },
    ])

    expect(mobile).toEqual([
      { dayOfWeek: 1, startTime: "08:30", endTime: "12:30" },
      { dayOfWeek: 0, startTime: "10:00", endTime: "14:00" },
    ])
    expect(dayNameToDayOfWeek("Sunday")).toBe(0)
    expect(dayOfWeekToDayName(1)).toBe("Monday")

    const restored = fromStoredAvailability(mobile)
    expect(restored.find((entry) => entry.day === "Monday")).toMatchObject({
      enabled: true,
      start: "08:30",
      end: "12:30",
    })
    expect(restored.find((entry) => entry.day === "Tuesday")?.enabled).toBe(false)
  })

  it("rejects enabled slots whose end is not after their start", () => {
    expect(
      hasEnabledAvailability([
        { day: "Monday", enabled: true, start: "17:00", end: "09:00" },
      ]),
    ).toBe(false)
  })
})

describe("patient identity mapping", () => {
  const patients = [
    {
      id: "portal-patient",
      firebaseUid: "firebase-patient",
      firstName: "Aisha",
      lastName: "Khan",
    },
  ]

  it("prefers the preserved portal ID and falls back to the Firebase UID", () => {
    expect(
      resolvePortalPatientId(
        { patientId: "firebase-patient", portalPatientId: "portal-patient" },
        patients,
      ),
    ).toBe("portal-patient")
    expect(resolvePortalPatientId({ patientId: "firebase-patient" }, patients)).toBe(
      "portal-patient",
    )
  })

  it("returns a real name but suppresses misleading placeholder names", () => {
    expect(getResolvedPatientName({ patientId: "firebase-patient" }, patients)).toBe(
      "Aisha Khan",
    )
    expect(
      getResolvedPatientName(
        { patientId: "firebase-patient" },
        [{ ...patients[0], firstName: "Unknown", lastName: "Individual" }],
      ),
    ).toBeNull()
  })
})

describe("AI task status contract", () => {
  it("normalizes Celery states and safely treats unknown states as pending", () => {
    expect(normalizeTaskStatus("STARTED")).toBe("processing")
    expect(normalizeTaskStatus("SUCCESS")).toBe("completed")
    expect(normalizeTaskStatus("FAILURE")).toBe("failed")
    expect(normalizeTaskStatus("provider-specific-state")).toBe("pending")
  })
})
