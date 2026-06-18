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

type ElasticBulkEmailRecipient = {
  Email: string
  Fields?: Record<string, string>
}

type ElasticBulkEmailPayload = {
  Content: ElasticEmailPayload['Content']
  Options?: {
    ChannelName?: string
    TrackClicks?: boolean
    TrackOpens?: boolean
  }
  Recipients: ElasticBulkEmailRecipient[]
}

type ElasticContactPayload = {
  Email: string
  Status?: 'Active' | 'Bounced' | 'Unsubscribed' | 'Inactive'
  FirstName?: string
  LastName?: string
  CustomFields?: Record<string, string>
}

type ElasticCampaignPayload = {
  Name: string
  Recipients: {
    ListNames: string[]
  }
  Content: Array<{
    Body: ElasticEmailBodyPart[]
    From: string
    ReplyTo?: string
    Subject: string
    TemplateType: 'RawHTML'
  }>
  Status: 'Active' | 'Draft'
}

type SendElasticMarketingEmailArgs = {
  fromEmail?: string
  fromName?: string
  html: string
  replyTo?: string
  subject: string
  text: string
  to: string
}

type SendElasticBulkMarketingEmailArgs = Omit<SendElasticMarketingEmailArgs, 'to'> & {
  channelName?: string
  recipients: ElasticBulkEmailRecipient[]
}

export type SendElasticMarketingEmailResult = {
  id: string
  message: string
}

const ELASTIC_EMAIL_TRANSACTIONAL_URL = 'https://api.elasticemail.com/v4/emails/transactional'
const ELASTIC_EMAIL_BULK_URL = 'https://api.elasticemail.com/v4/emails'
const ELASTIC_EMAIL_API_BASE = 'https://api.elasticemail.com/v4'
const EMAIL_ADDRESS_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required to send marketing email through Elastic Email.`)
  }
  return value
}

function getElasticFromAddress({
  fromEmail,
  fromName,
}: {
  fromEmail?: string
  fromName?: string
} = {}): string {
  const configuredFromEmail = fromEmail?.trim() || getRequiredEnv('ELASTIC_EMAIL_FROM_EMAIL')
  const parsed = parseEmailSender(configuredFromEmail)
  const configuredFromName = fromName?.trim() || process.env.ELASTIC_EMAIL_FROM_NAME?.trim() || parsed.name

  if (!EMAIL_ADDRESS_PATTERN.test(parsed.address)) {
    throw new Error(fromEmail ? 'Email sender must include a valid email address.' : 'ELASTIC_EMAIL_FROM_EMAIL must include a valid email address.')
  }

  return configuredFromName ? `${configuredFromName} <${parsed.address}>` : parsed.address
}

function getElasticApiKey(): string {
  return getRequiredEnv('ELASTIC_EMAIL_API_KEY')
}

function getElasticEmailContent({
  fromEmail,
  fromName,
  html,
  replyTo,
  subject,
  text,
}: {
  fromEmail?: string
  fromName?: string
  html: string
  replyTo?: string
  subject: string
  text: string
}): ElasticEmailPayload['Content'] {
  const content: ElasticEmailPayload['Content'] = {
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
    From: getElasticFromAddress({ fromEmail, fromName }),
    Subject: subject,
  }

  if (replyTo) {
    content.ReplyTo = replyTo
  }

  return content
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
  fromEmail,
  fromName,
  html,
  replyTo,
  subject,
  text,
  to,
}: SendElasticMarketingEmailArgs): Promise<SendElasticMarketingEmailResult> {
  const apiKey = getElasticApiKey()
  const payload: ElasticEmailPayload = {
    Content: getElasticEmailContent({ fromEmail, fromName, html, replyTo, subject, text }),
    Recipients: {
      To: [to],
    },
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

export async function sendElasticBulkMarketingEmail({
  channelName,
  fromEmail,
  fromName,
  html,
  recipients,
  replyTo,
  subject,
  text,
}: SendElasticBulkMarketingEmailArgs): Promise<SendElasticMarketingEmailResult> {
  if (!recipients.length) throw new Error('At least one recipient is required.')

  const payload: ElasticBulkEmailPayload = {
    Content: getElasticEmailContent({ fromEmail, fromName, html, replyTo, subject, text }),
    Options: {
      ChannelName: channelName,
      TrackClicks: true,
      TrackOpens: true,
    },
    Recipients: recipients,
  }

  const res = await fetch(ELASTIC_EMAIL_BULK_URL, {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      'X-ElasticEmail-ApiKey': getElasticApiKey(),
    },
    method: 'POST',
  })

  const responseText = await res.text()

  if (!res.ok) {
    throw new Error(await getElasticErrorMessage(new Response(responseText, { status: res.status })))
  }

  const data = parseJsonResponse(responseText)
  const id = channelName || getElasticSuccessId(data)

  return {
    id,
    message: id ? `Elastic Email bulk send accepted: ${id}` : 'Elastic Email bulk send accepted.',
  }
}

async function elasticFetch(path: string, init: { body?: unknown; method?: 'GET' | 'POST' | 'PUT' | 'DELETE' } = {}) {
  const res = await fetch(`${ELASTIC_EMAIL_API_BASE}${path}`, {
    body: typeof init.body === 'undefined' ? undefined : JSON.stringify(init.body),
    headers: {
      'Content-Type': 'application/json',
      'X-ElasticEmail-ApiKey': getElasticApiKey(),
    },
    method: init.method || 'GET',
  })
  const responseText = await res.text()

  if (!res.ok) {
    throw new Error(await getElasticErrorMessage(new Response(responseText, { status: res.status })))
  }

  return parseJsonResponse(responseText)
}

function encodeListName(value: string): string {
  return encodeURIComponent(value)
}

export async function upsertElasticList({
  allowUnsubscribe = true,
  emails = [],
  listName,
}: {
  allowUnsubscribe?: boolean
  emails?: string[]
  listName: string
}) {
  try {
    return await elasticFetch('/lists', {
      body: {
        AllowUnsubscribe: allowUnsubscribe,
        Emails: emails,
        ListName: listName,
      },
      method: 'POST',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exists|409|conflict/i.test(message)) throw error

    return elasticFetch(`/lists/${encodeListName(listName)}`, {
      body: {
        AllowUnsubscribe: allowUnsubscribe,
        ListName: listName,
      },
      method: 'PUT',
    })
  }
}

export async function addElasticContactsToList({
  contacts,
  listName,
}: {
  contacts: ElasticContactPayload[]
  listName: string
}) {
  if (!contacts.length) return null

  return elasticFetch(`/contacts?listnames=${encodeListName(listName)}`, {
    body: contacts,
    method: 'POST',
  })
}

export async function createElasticCampaign({
  fromEmail,
  fromName,
  html,
  listName,
  name,
  replyTo,
  status = 'Active',
  subject,
  text,
}: {
  fromEmail?: string
  fromName?: string
  html: string
  listName: string
  name: string
  replyTo?: string
  status?: 'Active' | 'Draft'
  subject: string
  text: string
}): Promise<SendElasticMarketingEmailResult> {
  const content: ElasticCampaignPayload['Content'][number] = {
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
    From: getElasticFromAddress({ fromEmail, fromName }),
    Subject: subject,
    TemplateType: 'RawHTML',
  }

  if (replyTo) {
    content.ReplyTo = replyTo
  }

  const payload: ElasticCampaignPayload = {
    Content: [content],
    Name: name,
    Recipients: {
      ListNames: [listName],
    },
    Status: status,
  }
  const response = await elasticFetch('/campaigns', {
    body: payload,
    method: 'POST',
  })

  const id = getElasticSuccessId(response) || name
  return {
    id,
    message: id ? `Elastic Email campaign created: ${id}` : 'Elastic Email campaign created.',
  }
}
