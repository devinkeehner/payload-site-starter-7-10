import type { PayloadRequest } from 'payload'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id || null
  }

  if (!isRecord(value)) return null

  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

function getTenantIdFromUser(user: unknown): string | null {
  if (!isRecord(user) || !Array.isArray(user.tenants) || user.tenants.length !== 1) return null

  const firstTenant = user.tenants[0]
  if (!isRecord(firstTenant)) return null

  return getId(firstTenant.tenant)
}

function getTenantId(data: UnknownRecord, req: PayloadRequest): string | null {
  const fromData = getId(data.tenant)
  if (fromData) return fromData

  const requestTenant = (req as PayloadRequest & { tenant?: unknown }).tenant
  const fromRequest = getId(requestTenant)
  if (fromRequest) return fromRequest

  return getTenantIdFromUser(req.user)
}

function getSiteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FRONTEND_SERVER_URL ||
    process.env.PREVIEW_FRONTEND_ORIGIN ||
    'https://www.cthousegop.com'
  ).replace(/\/$/, '')
}

async function getTenantSlug(req: PayloadRequest, tenantId: string): Promise<string> {
  try {
    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: tenantId,
      depth: 0,
      req,
      select: {
        slug: true,
      },
    })

    return getString((tenant as UnknownRecord | null)?.slug)
  } catch {
    return ''
  }
}

function getTenantHomeUrl(tenantSlug: string): string {
  const base = getSiteBase()
  return tenantSlug && tenantSlug !== 'main' ? `${base}/${tenantSlug}` : base
}

function formatOrdinal(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`

  switch (value % 10) {
    case 1:
      return `${value}st`
    case 2:
      return `${value}nd`
    case 3:
      return `${value}rd`
    default:
      return `${value}th`
  }
}

function buildSocialLinks(repInfo: UnknownRecord | null): UnknownRecord[] {
  if (!repInfo) return []

  return [
    { platform: 'facebook', url: repInfo.facebook },
    { platform: 'instagram', url: repInfo.instagram },
    { platform: 'x', url: repInfo.x },
    { platform: 'youtube', url: repInfo.youtube },
    { platform: 'flickr', url: repInfo.flickrURL },
  ]
    .map((item) => ({
      platform: item.platform,
      url: getString(item.url),
    }))
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

function richTextDefault(text: string): UnknownRecord {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

async function findTenantDoc(
  req: PayloadRequest,
  collection: 'rep-info' | 'standard-media',
  tenantId: string,
  select: UnknownRecord,
): Promise<UnknownRecord | null> {
  const result = await req.payload.find({
    collection,
    depth: 0,
    limit: 1,
    req,
    select,
    where: {
      tenant: {
        equals: tenantId,
      },
    },
  })

  const doc = result.docs[0]
  return isRecord(doc) ? doc : null
}

export async function buildDefaultEmailLayout(data: UnknownRecord, req: PayloadRequest): Promise<UnknownRecord[]> {
  const tenantId = getTenantId(data, req)
  const tenantSlug = tenantId ? await getTenantSlug(req, tenantId) : ''
  const tenantHomeUrl = getTenantHomeUrl(tenantSlug)

  const [standardMedia, repInfo] = tenantId
    ? await Promise.all([
        findTenantDoc(req, 'standard-media', tenantId, { defaultFeaturedImage: true }),
        findTenantDoc(req, 'rep-info', tenantId, {
          districtNumber: true,
          facebook: true,
          flickrURL: true,
          instagram: true,
          name: true,
          towns: true,
          x: true,
          youtube: true,
        }),
      ])
    : [null, null]

  const featuredImageId = getId(standardMedia?.defaultFeaturedImage)
  const repName = getString(repInfo?.name)
  const districtNumber = typeof repInfo?.districtNumber === 'number' ? repInfo.districtNumber : null
  const footerBody = districtNumber
    ? `Updates from State Representative ${repName || ''}, serving the ${formatOrdinal(districtNumber)} District.`.replace(/\s+/g, ' ').trim()
    : 'Thank you for reading.'

  const layout: UnknownRecord[] = []

  if (featuredImageId) {
    layout.push({
      blockType: 'emailImage',
      media: featuredImageId,
      width: 560,
    })
  }

  layout.push({
    align: 'left',
    blockType: 'emailHeading',
    color: 'foreground',
    level: 'h1',
    text: getString(data.subject) || getString(data.title) || 'Latest update',
  })

  layout.push({
    align: 'left',
    blockType: 'emailText',
    color: 'foreground',
    text: richTextDefault('Write the body copy for this email.'),
  })

  layout.push({
    address: '',
    blockType: 'emailFooterOneColumn',
    body: footerBody,
    copyright: `Copyright ${new Date().getFullYear()}`,
    heading: 'Stay connected',
    links: [
      { label: 'Website', url: tenantHomeUrl },
      { label: 'Contact', url: `${tenantHomeUrl}/contact` },
    ],
    socialLinks: buildSocialLinks(repInfo),
    towns: buildTownLinks(repInfo),
  })

  return layout
}
