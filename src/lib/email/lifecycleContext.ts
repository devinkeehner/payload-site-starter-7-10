import type { PayloadRequest } from 'payload'

export const EMAIL_LIFECYCLE_CONTEXT_KEY = 'emailLifecycleTransition'

export const emailLifecycleContext = {
  [EMAIL_LIFECYCLE_CONTEXT_KEY]: true,
} as const

export function isEmailLifecycleRequest(req: PayloadRequest | undefined): boolean {
  if (!req?.context || typeof req.context !== 'object') return false
  return (req.context as Record<string, unknown>)[EMAIL_LIFECYCLE_CONTEXT_KEY] === true
}
