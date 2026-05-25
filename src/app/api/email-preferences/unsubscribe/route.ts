import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'

import { normalizeEmailAddress } from '@/lib/email/contactNormalization'

type Body = {
  campaign?: unknown
  email?: unknown
  list?: unknown
  scope?: unknown
  tenant?: unknown
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = (value as Record<string, unknown>).id ?? (value as Record<string, unknown>).value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

async function getBody(req: Request): Promise<Body> {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return (await req.json()) as Body

  const form = await req.formData()
  return Object.fromEntries(form.entries()) as Body
}

export async function POST(req: Request) {
  const payload = await getPayload({ config: configPromise })
  const body = await getBody(req)
  const email = normalizeEmailAddress(body.email)
  const tenantSlug = getString(body.tenant)
  const requestedScope = getString(body.scope) === 'all' ? 'all' : 'list'
  let listId = getString(body.list)

  if (!email || email.includes('{') || !email.includes('@')) {
    return new Response('Enter the email address you want to unsubscribe.', { status: 400 })
  }
  if (!tenantSlug) {
    return new Response('Site is required.', { status: 400 })
  }

  const tenantResult = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      slug: {
        equals: tenantSlug,
      },
    },
  })
  const tenant = tenantResult.docs[0]
  if (!tenant) return new Response('Site not found.', { status: 404 })

  if (!listId && getString(body.campaign)) {
    const campaign = await payload.findByID({
      collection: 'emails',
      depth: 0,
      id: getString(body.campaign),
      overrideAccess: true,
    }).catch(() => null)
    listId = getId((campaign as Record<string, unknown> | null)?.emailList) || ''
  }

  const contactResult = await payload.find({
    collection: 'contacts',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        { normalizedEmail: { equals: email } },
        { tenant: { equals: tenant.id } },
      ],
    },
  })
  const contact = contactResult.docs[0]
  if (!contact) {
    return Response.json({
      message: 'No matching contact was found. No further emails should be sent if this address is not in the audience list.',
      updated: 0,
    })
  }

  const membershipWhere: Where = requestedScope === 'all'
    ? {
        and: [
          { contact: { equals: contact.id } },
          { tenant: { equals: tenant.id } },
        ],
      }
    : {
        and: [
          { contact: { equals: contact.id } },
          ...(listId ? [{ emailList: { equals: listId } }] : []),
          { tenant: { equals: tenant.id } },
        ],
      }

  const memberships = await payload.find({
    collection: 'email-list-memberships',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where: membershipWhere,
  })
  const now = new Date().toISOString()

  for (const membership of memberships.docs) {
    await payload.update({
      collection: 'email-list-memberships',
      data: {
        status: 'unsubscribed',
        unsubscribedAt: now,
      },
      id: membership.id,
      overrideAccess: true,
    })
  }

  if (requestedScope === 'all') {
    await payload.update({
      collection: 'contacts',
      data: {
        status: 'unsubscribed',
      },
      id: contact.id,
      overrideAccess: true,
    })
  }

  return Response.json({
    message: requestedScope === 'all'
      ? 'You have been unsubscribed from all emails for this site.'
      : 'You have been unsubscribed from this email list.',
    scope: requestedScope,
    updated: memberships.docs.length,
  })
}
