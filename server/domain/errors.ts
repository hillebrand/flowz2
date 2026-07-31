// Technische error-envelope (architectuur AD-6 / Consistency Conventions).
// Nooit gebruiken voor tijd-/energiegebrek-meldingen — zie notification.ts.

export const ErrorCodes = {
  InternalError: 'internal_error',
  ValidationError: 'validation_error'
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export interface ErrorEnvelope {
  error: {
    code: ErrorCode
    message: string
  }
}
