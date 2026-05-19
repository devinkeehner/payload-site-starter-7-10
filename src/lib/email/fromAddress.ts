type EmailSender = {
  address: string
  name: string
}

const NAMED_EMAIL_PATTERN = /^\s*(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>\s*$/

export function parseEmailSender(value?: string | null): EmailSender {
  const rawValue = value?.trim() || ''
  const match = rawValue.match(NAMED_EMAIL_PATTERN)

  if (match) {
    return {
      address: match[2]?.trim() || '',
      name: match[1]?.trim() || '',
    }
  }

  return {
    address: rawValue,
    name: '',
  }
}

export function getDefaultEmailAddress() {
  return parseEmailSender(process.env.RESEND_FROM_EMAIL).address
}

export function getDefaultEmailName() {
  const configuredName = process.env.RESEND_FROM_NAME?.trim()
  return configuredName || parseEmailSender(process.env.RESEND_FROM_EMAIL).name
}
