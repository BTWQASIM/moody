export interface AppointmentPatientReference {
  patientId?: string
  portalPatientId?: string
  patientName?: string
}

export interface PatientIdentityRecord {
  id?: string
  firebaseUid?: string
  firstName?: string
  lastName?: string
}

export function resolvePortalPatientId(
  appointment: AppointmentPatientReference,
  patients: PatientIdentityRecord[],
): string | null {
  if (appointment.portalPatientId) return appointment.portalPatientId

  const byFirebase = patients.find(
    (patient) => patient.firebaseUid === appointment.patientId,
  )
  if (byFirebase?.id) return byFirebase.id

  const byDocumentId = patients.find(
    (patient) => patient.id === appointment.patientId,
  )
  return byDocumentId?.id ?? null
}

export function resolvePatientForAppointment(
  appointment: AppointmentPatientReference,
  patients: PatientIdentityRecord[],
): PatientIdentityRecord | null {
  const portalPatientId = resolvePortalPatientId(appointment, patients)
  return (
    patients.find(
      (patient) =>
        patient.id === portalPatientId ||
        patient.firebaseUid === appointment.patientId,
    ) ?? null
  )
}

export function getResolvedPatientName(
  appointment: AppointmentPatientReference,
  patients: PatientIdentityRecord[],
): string | null {
  const patient = resolvePatientForAppointment(appointment, patients)
  const nameParts = [patient?.firstName, patient?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean) as string[]

  if (
    nameParts.length === 0 ||
    nameParts.some((part) =>
      ["unknown", "individual", "n/a"].includes(part.toLowerCase()),
    )
  ) {
    return null
  }

  return nameParts.join(" ")
}
