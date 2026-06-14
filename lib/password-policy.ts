export const PASSWORD_MIN_LENGTH = 8

export type PasswordRequirement = {
  id: string
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "One uppercase letter (A–Z)",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "lowercase",
    label: "One lowercase letter (a–z)",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "number",
    label: "One number (0–9)",
    test: (password) => /\d/.test(password),
  },
  {
    id: "special",
    label: "One special character (!@#$…)",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
]

export function validatePassword(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors = PASSWORD_REQUIREMENTS.filter((rule) => !rule.test(password)).map(
    (rule) => rule.label,
  )

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function getPasswordValidationError(password: string): string | null {
  const { errors } = validatePassword(password)
  if (errors.length === 0) return null
  return `Password must include: ${errors.join(", ")}.`
}

export function getPasswordRequirementChecks(password: string) {
  return PASSWORD_REQUIREMENTS.map((rule) => ({
    ...rule,
    met: rule.test(password),
  }))
}
