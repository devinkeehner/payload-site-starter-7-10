import type { Payload, PayloadRequest } from 'payload'

type UnknownRecord = Record<string, unknown>

export type EmailFooterContext = {
  address: string
  hasAddress: boolean
  socialLinks: UnknownRecord[]
  tenantHomeUrl: string
  tenantSlug: string
  towns: UnknownRecord[]
  unsubscribeUrl: string
}

export const DEFAULT_EMAIL_FOOTER_ADDRESS = [
  'Legislative Office Building, Room 4200',
  '300 Capitol Avenue',
  'Hartford, CT 06106',
  '',
  '860-240-8700',
  '800-842-1423',
].join('\n')

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id || null
  }

  if (!isRecord(value)) return null

  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

export function getFrontendBaseURL() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FRONTEND_SERVER_URL ||
    process.env.PREVIEW_FRONTEND_ORIGIN ||
    'https://www.cthousegop.com'
  ).replace(/\/$/, '')
}

function getTenantHomeUrl(tenantSlug: string) {
  const base = getFrontendBaseURL()
  return tenantSlug && tenantSlug !== 'main' ? `${base}/${tenantSlug}` : base
}

function formatAddress(repInfo: UnknownRecord | null) {
  const explicit = getString(repInfo?.mailingAddress)
  if (explicit) return explicit

  const parts = [
    getString(repInfo?.mailingAddressLine1),
    getString(repInfo?.mailingAddressLine2),
    [getString(repInfo?.mailingAddressCity), getString(repInfo?.mailingAddressState), getString(repInfo?.mailingAddressPostalCode)]
      .filter(Boolean)
      .join(' '),
  ].filter(Boolean)

  return parts.join('\n') || DEFAULT_EMAIL_FOOTER_ADDRESS
}

function buildSocialLinks(repInfo: UnknownRecord | null): UnknownRecord[] {
  return [
    { platform: 'facebook', url: repInfo?.facebook },
    { platform: 'instagram', url: repInfo?.instagram },
    { platform: 'x', url: repInfo?.x },
    { platform: 'youtube', url: repInfo?.youtube },
    { platform: 'flickr', url: repInfo?.flickrURL },
  ]
    .map((item) => ({ platform: item.platform, url: getString(item.url) }))
    .filter((item) => item.url)
}

function buildTownLinks(repInfo: UnknownRecord | null): UnknownRecord[] {
  const towns = Array.isArray(repInfo?.towns) ? repInfo.towns : []

  return towns
    .filter((town): town is UnknownRecord => isRecord(town))
    .map((town) => ({
      town: getString(town.town),
      url: getString(town.url),
    }))
    .filter((town) => town.town)
}

async function getTenantSlug(payload: Payload, req: PayloadRequest, tenantId: string, overrideAccess: boolean) {
  const tenant = (await payload.findByID({
    collection: 'tenants',
    depth: 0,
    id: tenantId,
    overrideAccess,
    req,
    select: { slug: true },
  })) as UnknownRecord | null

  return getString(tenant?.slug)
}

async function getRepInfo(payload: Payload, req: PayloadRequest, tenantId: string, overrideAccess: boolean) {
  const result = await payload.find({
    collection: 'rep-info',
    depth: 0,
    limit: 1,
    overrideAccess,
    req,
    where: {
      tenant: {
        equals: tenantId,
      },
    },
  })

  const doc = result.docs[0] as unknown
  return isRecord(doc) ? doc : null
}

export async function getEmailFooterContext({
  email,
  emailList,
  payload,
  req,
  overrideAccess = false,
}: {
  email?: UnknownRecord | null
  emailList?: UnknownRecord | null
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<EmailFooterContext> {
  const tenantId = getId(email?.tenant) || getId(emailList?.tenant)
  const tenantSlug = tenantId ? await getTenantSlug(payload, req, tenantId, overrideAccess) : ''
  const repInfo = tenantId ? await getRepInfo(payload, req, tenantId, overrideAccess) : null
  const tenantHomeUrl = getTenantHomeUrl(tenantSlug)
  const listId = getId(email?.emailList) || getId(emailList)
  const emailId = getId(email)
  const query = new URLSearchParams()

  if (emailId) query.set('campaign', emailId)
  if (listId) query.set('list', listId)
  query.set('email', '{email}')
  query.set('scope', 'list')

  const pathTenant = tenantSlug && tenantSlug !== 'main' ? `/${tenantSlug}` : ''
  const unsubscribeUrl = `${getFrontendBaseURL()}${pathTenant}/email-preferences?${query.toString().replace('%7Bemail%7D', '{email}')}`
  const address = formatAddress(repInfo)

  return {
    address,
    hasAddress: Boolean(address),
    socialLinks: buildSocialLinks(repInfo),
    tenantHomeUrl,
    tenantSlug,
    towns: buildTownLinks(repInfo),
    unsubscribeUrl,
  }
}

export function applyEmailFooterContext(layout: unknown, context: EmailFooterContext): unknown[] {
  const blocks = Array.isArray(layout)
    ? layout.filter((block): block is UnknownRecord => isRecord(block))
    : []

  return blocks.map((block) => {
    if (block.blockType !== 'emailFooterOneColumn') return block

    const links = Array.isArray(block.links) ? block.links.filter((item) => isRecord(item)) : []
    const withoutPreferences = links.filter((link) => getString(link.label).toLowerCase() !== 'email preferences')

    return {
      ...block,
      address: context.address || block.address,
      links: [
        ...withoutPreferences,
        {
          label: 'Email Preferences',
          url: context.unsubscribeUrl,
        },
      ],
      socialLinks: context.socialLinks.length ? context.socialLinks : block.socialLinks,
      towns: context.towns.length ? context.towns : block.towns,
    }
  })
}

export async function prepareEmailLayoutForRender({
  email,
  emailList,
  payload,
  req,
  overrideAccess,
}: {
  email: UnknownRecord
  emailList?: UnknownRecord | null
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}) {
  const footerContext = await getEmailFooterContext({ email, emailList, overrideAccess, payload, req })
  return {
    footerContext,
    layout: applyEmailFooterContext(email.layout, footerContext),
  }
}
