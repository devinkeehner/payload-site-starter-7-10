import { parseEmailSender } from './fromAddress'

type ElasticEmailBodyPart = {
  Charset: 'utf-8'
  Content: string
  ContentType: 'HTML' | 'PlainText'
}

type ElasticEmailPayload = {
  Content: {
    Body: ElasticEmailBodyPart[]
    From: string
    ReplyTo?: string
    Subject: string
  }
  Recipients: {
    To: string[]
  }
}

type SendElasticMarketingEmailArgs = {
  html: string
  replyTo?: string
  subject: string
  text: string
  to: string
}

export type SendElasticMarketingEmailResult = {
  id: string
  message: string
}

const ELASTIC_EMAIL_TRANSACTIONAL_URL = 'https://api.elasticemail.com/v4/emails/transactional'
const EMAIL_ADDRESS_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required to send marketing email through Elastic Email.`)
  }
  return value
}

function getElasticFromAddress(): string {
  const parsed = parseEmailSender(getRequiredEnv('ELASTIC_EMAIL_FROM_EMAIL'))
  const fromName = process.env.ELASTIC_EMAIL_FROM_NAME?.trim() || parsed.name

  if (!EMAIL_ADDRESS_PATTERN.test(parsed.address)) {
    throw new Error('ELASTIC_EMAIL_FROM_EMAIL must include a valid email address.')
  }

  return fromName ? `${fromName} <${parsed.address}>` : parsed.address
}

async function getElasticErrorMessage(res: Response): Promise<string> {
  const body = await res.text()
  if (!body) return `Elastic Email send failed with status ${res.status}.`

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const message = parsed.Message || parsed.message || parsed.Error || parsed.error
    if (typeof message === 'string' && message.trim()) {
      return `Elastic Email send failed with status ${res.status}: ${message.trim()}`
    }
  } catch {
    // Fall back to the raw body below.
  }

  return `Elastic Email send failed with status ${res.status}: ${body}`
}

function parseJsonResponse(value: string): unknown {
  if (!value) return null

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function getElasticSuccessId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''

  const record = value as Record<string, unknown>
  const id = record.TransactionID || record.MessageID || record.transactionID || record.messageID
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
}

export async function sendElasticMarketingEmail({
  html,
  replyTo,
  subject,
  text,
  to,
}: SendElasticMarketingEmailArgs): Promise<SendElasticMarketingEmailResult> {
  const apiKey = getRequiredEnv('ELASTIC_EMAIL_API_KEY')
  const payload: ElasticEmailPayload = {
    Content: {
      Body: [
        {
          Charset: 'utf-8',
          Content: html,
          ContentType: 'HTML',
        },
        {
          Charset: 'utf-8',
          Content: text,
          ContentType: 'PlainText',
        },
      ],
      From: getElasticFromAddress(),
      Subject: subject,
    },
    Recipients: {
      To: [to],
    },
  }

  if (replyTo) {
    payload.Content.ReplyTo = replyTo
  }

  const res = await fetch(ELASTIC_EMAIL_TRANSACTIONAL_URL, {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      'X-ElasticEmail-ApiKey': apiKey,
    },
    method: 'POST',
  })

  const responseText = await res.text()

  if (!res.ok) {
    throw new Error(await getElasticErrorMessage(new Response(responseText, { status: res.status })))
  }

  const data = parseJsonResponse(responseText)
  const id = getElasticSuccessId(data)

  return {
    id,
    message: id ? `Email sent successfully. Elastic Email ID: ${id}` : 'Email sent successfully.',
  }
}
