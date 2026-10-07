import { beforeEach, describe, expect, it, vi } from "vitest"

const firebaseState = vi.hoisted(() => ({
  currentUser: {
    getIdToken: vi.fn(async () => "firebase-token"),
  } as { getIdToken: () => Promise<string> } | null,
}))

vi.mock("./firebase", () => ({
  auth: firebaseState,
}))

import { aiAPI, appointmentAPI, patientAPI, uploadsAPI } from "./api"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("authenticated API integration contract", () => {
  beforeEach(() => {
    firebaseState.currentUser = {
      getIdToken: vi.fn(async () => "firebase-token"),
    }
    vi.restoreAllMocks()
  })

  it("refuses requests when Firebase has no authenticated user", async () => {
    firebaseState.currentUser = null
    await expect(patientAPI.list()).rejects.toThrow("User not authenticated")
  })

  it("creates a patient with a bearer token and the exact JSON payload", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ status: "success", patientId: "patient-1" }))
    const payload = {
      firstName: "Aisha",
      lastName: "Khan",
      email: "aisha@example.com",
      phone: "+92 300 0000000",
    }

    await expect(patientAPI.create(payload)).resolves.toMatchObject({
      patientId: "patient-1",
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("http://localhost:8000/api/patients/")
    expect(options?.method).toBe("POST")
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer firebase-token",
      "Content-Type": "application/json",
    })
    expect(JSON.parse(String(options?.body))).toEqual(payload)
  })

  it("uses backend filter names required by the appointment API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ status: "success", appointments: [] }))

    await appointmentAPI.list({
      patientId: "portal-patient",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    })

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/appointments/?patient_id=portal-patient&start_date=2026-10-01&end_date=2026-10-31",
    )
  })

  it("links a mobile account without exposing or submitting a Firebase UID", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({
          status: "success",
          mobileAccountEmail: "patient@moodie.com",
        }),
      )

    await patientAPI.linkMobileAccount("portal-patient")

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("http://localhost:8000/api/patients/portal-patient/link")
    expect(options?.method).toBe("PATCH")
    expect(options?.body).toBeUndefined()
  })

  it("surfaces FastAPI validation details instead of a generic status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          detail: [
            { loc: ["body", "duration"], msg: "Input should be greater than 0" },
          ],
        },
        422,
      ),
    )

    await expect(
      appointmentAPI.create({
        patientId: "patient-1",
        scheduledAt: "2026-10-10T10:00:00Z",
        duration: 0,
        type: "individual",
      }),
    ).rejects.toThrow("Input should be greater than 0")
  })

  it("uploads notes as multipart data without forcing a JSON content type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ status: "success", content: "Reviewed coping plan" }),
    )
    const file = new File(["Reviewed coping plan"], "notes.txt", {
      type: "text/plain",
    })

    await aiAPI.extractNotesFile(file)

    const [, options] = fetchMock.mock.calls[0]
    expect(options?.method).toBe("POST")
    expect(options?.headers).toEqual({ Authorization: "Bearer firebase-token" })
    expect(options?.body).toBeInstanceOf(FormData)
    expect((options?.body as FormData).get("file")).toBe(file)
  })

  it("URL-encodes uploaded file paths before deletion", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ status: "success" }))

    await uploadsAPI.deleteFile("documents/therapist one/license.pdf")

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/uploads/documents%2Ftherapist%20one%2Flicense.pdf",
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE")
  })
})
