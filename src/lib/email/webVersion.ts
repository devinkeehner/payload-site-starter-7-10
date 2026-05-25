import { createHmac, timingSafeEqual } from 'crypto'

function getSecret() {
  const secret = process.env.EMAIL_WEB_VERSION_SECRET || process.env.PAYLOAD_SECRET || ''
  if (!secret) throw new Error('PAYLOAD_SECRET is required for email web version links.')
  return secret
}

export function createEmailWebVersionToken(emailId: string) {
  return createHmac('sha256', getSecret()).update(emailId).digest('hex')
}

export function verifyEmailWebVersionToken(emailId: string, token: string) {
  if (!emailId || !token) return false

  const expected = createEmailWebVersionToken(emailId)
  const expectedBuffer = Buffer.from(expected, 'hex')
  const tokenBuffer = Buffer.from(token, 'hex')

  if (expectedBuffer.length !== tokenBuffer.length) return false
  return timingSafeEqual(expectedBuffer, tokenBuffer)
}

export function getEmailWebVersionUrl(emailId: string, origin: string) {
  const normalizedOrigin = origin.replace(/\/$/, '')
  const token = createEmailWebVersionToken(emailId)
  return `${normalizedOrigin}/api/emails/web-version/${encodeURIComponent(emailId)}?token=${token}`
}
