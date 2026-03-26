import type { Payload } from 'payload'

type TenantRef = { id?: string | null; slug?: string | null } | string | null | undefined
type BaseDoc = { id?: string; slug?: string | null; updatedAt?: string | null; tenant?: TenantRef }

type SitemapEntry = {
  group: SitemapGroup
  loc: string
  lastmod: string
}

type SitemapArtifactRecord = {
  id: string
  key?: string | null
  xml?: string | null
  itemCount?: number | null
  contentType?: string | null
}

type PersistedArtifact = {
  key: string
  xml: string
  itemCount: number
  generatedAt: string
  contentType: string
}

type PayloadFindResult<T> = {
  docs: T[]
  hasNextPage?: boolean
  nextPage?: number | null
  totalPages?: number
}

type SitemapGroup =
  | 'root-pages'
  | 'tenant-pages'
  | 'root-posts'
  | 'tenant-posts'
  | 'root-wordpress-posts'
  | 'tenant-wordpress-posts'

const ARTIFACT_COLLECTION = 'sitemap-artifacts' as never
const TENANTS_COLLECTION = 'tenants' as never
const PAGES_COLLECTION = 'pages' as never
const POSTS_COLLECTION = 'posts' as never
const WORDPRESS_POSTS_COLLECTION = 'wordpress-posts' as never

const SITEMAP_CONTENT_TYPE = 'application/xml; charset=utf-8'
const SITEMAP_CHUNK_SIZE = 500

const getFrontendSiteBase = (): string => {
  const explicitSite = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  const previewOrigin = process.env.PREVIEW_FRONTEND_ORIGIN?.replace(/\/$/, '')
  const frontendServer = process.env.FRONTEND_SERVER_URL?.replace(/\/$/, '')
  return explicitSite || previewOrigin || frontendServer || 'https://www.cthousegop.com'
}

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const isMainTenant = (tenantSlug?: string): boolean => !tenantSlug || tenantSlug === 'main'

const getTenantId = (tenant: TenantRef): string | undefined => {
  if (!tenant) return undefined
  if (typeof tenant === 'string') return tenant || undefined
  if (typeof tenant.id === 'string') return tenant.id || undefined
  return undefined
}

const getTenantSlug = (tenant: TenantRef, tenantSlugMap: Map<string, string>): string | undefined => {
  if (!tenant) return undefined
  if (typeof tenant === 'object' && typeof tenant.slug === 'string' && tenant.slug) return tenant.slug
  const tenantId = getTenantId(tenant)
  return tenantId ? tenantSlugMap.get(tenantId) : undefined
}

const chunkEntries = (entries: SitemapEntry[]): SitemapEntry[][] => {
  const chunks: SitemapEntry[][] = []

  for (let index = 0; index < entries.length; index += SITEMAP_CHUNK_SIZE) {
    chunks.push(entries.slice(index, index + SITEMAP_CHUNK_SIZE))
  }

  return chunks
}

const getLatestTimestamp = (values: string[]): string => {
  const timestamps = values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)

  return timestamps[0] ? new Date(timestamps[0]).toISOString() : new Date().toISOString()
}

const buildUrlsetXml = (entries: SitemapEntry[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map((entry) => `  <url><loc>${xmlEscape(entry.loc)}</loc><lastmod>${xmlEscape(entry.lastmod)}</lastmod></url>`)
    .join('\n')}\n</urlset>`

const buildSitemapIndexXml = (items: Array<{ loc: string; lastmod: string }>): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items
    .map((item) => `  <sitemap><loc>${xmlEscape(item.loc)}</loc><lastmod>${xmlEscape(item.lastmod)}</lastmod></sitemap>`)
    .join('\n')}\n</sitemapindex>`

async function fetchTenantSlugMap(payload: Payload): Promise<Map<string, string>> {
  const result = (await payload.find({
    collection: TENANTS_COLLECTION,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: {
      slug: true,
    },
  } as never)) as PayloadFindResult<{ id: string; slug?: string | null }>

  return new Map(
    (result.docs || [])
      .filter((doc) => typeof doc.id === 'string' && typeof doc.slug === 'string' && doc.slug)
      .map((doc) => [doc.id, doc.slug as string]),
  )
}

async function fetchAllPublishedDocs(
  payload: Payload,
  collection: typeof PAGES_COLLECTION | typeof POSTS_COLLECTION | typeof WORDPRESS_POSTS_COLLECTION,
  statusField: '_status' | 'status',
): Promise<BaseDoc[]> {
  const docs: BaseDoc[] = []
  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const result = (await payload.find({
      collection,
      depth: 0,
      limit: SITEMAP_CHUNK_SIZE,
      overrideAccess: true,
      page,
      select: {
        slug: true,
        tenant: true,
        updatedAt: true,
      },
      where: {
        [statusField]: {
          equals: 'published',
        },
      },
    } as never)) as unknown as PayloadFindResult<BaseDoc>

    docs.push(...(result.docs || []))
    hasNextPage = Boolean(result.hasNextPage)
    page = typeof result.nextPage === 'number' ? result.nextPage : page + 1

    if (typeof result.totalPages === 'number' && page > result.totalPages) {
      hasNextPage = false
    }
  }

  return docs
}

function buildPageEntries(docs: BaseDoc[], tenantSlugMap: Map<string, string>): SitemapEntry[] {
  const siteBase = getFrontendSiteBase()
  const fallbackDate = new Date().toISOString()
  const staticEntries: SitemapEntry[] = [
    { group: 'root-pages', loc: `${siteBase}/search`, lastmod: fallbackDate },
    { group: 'root-pages', loc: `${siteBase}/posts`, lastmod: fallbackDate },
  ]

  const dynamicEntries = docs
    .map((doc): SitemapEntry | null => {
      const slug = typeof doc.slug === 'string' ? doc.slug.trim() : ''
      if (!slug) return null

      const tenantSlug = getTenantSlug(doc.tenant, tenantSlugMap)
      const rootTenant = isMainTenant(tenantSlug)
      const loc =
        slug === 'home'
          ? rootTenant
            ? `${siteBase}/`
            : `${siteBase}/${tenantSlug}`
          : rootTenant
            ? `${siteBase}/${slug}`
            : `${siteBase}/${tenantSlug}/${slug}`

      return {
        group: rootTenant ? 'root-pages' : 'tenant-pages',
        loc,
        lastmod: typeof doc.updatedAt === 'string' && doc.updatedAt ? doc.updatedAt : fallbackDate,
      }
    })
    .filter((entry): entry is SitemapEntry => Boolean(entry))

  return [...staticEntries, ...dynamicEntries]
}

function buildPostEntries(docs: BaseDoc[], tenantSlugMap: Map<string, string>): SitemapEntry[] {
  const siteBase = getFrontendSiteBase()
  const fallbackDate = new Date().toISOString()

  return docs
    .map((doc): SitemapEntry | null => {
      const slug = typeof doc.slug === 'string' ? doc.slug.trim() : ''
      if (!slug) return null

      const tenantSlug = getTenantSlug(doc.tenant, tenantSlugMap)
      const rootTenant = isMainTenant(tenantSlug)

      return {
        group: rootTenant ? 'root-posts' : 'tenant-posts',
        loc: rootTenant ? `${siteBase}/post/${slug}` : `${siteBase}/${tenantSlug}/${slug}`,
        lastmod: typeof doc.updatedAt === 'string' && doc.updatedAt ? doc.updatedAt : fallbackDate,
      }
    })
    .filter((entry): entry is SitemapEntry => Boolean(entry))
}

function buildWordpressEntries(docs: BaseDoc[], tenantSlugMap: Map<string, string>): SitemapEntry[] {
  const siteBase = getFrontendSiteBase()
  const fallbackDate = new Date().toISOString()

  return docs
    .map((doc): SitemapEntry | null => {
      const slug = typeof doc.slug === 'string' ? doc.slug.trim() : ''
      if (!slug) return null

      const tenantSlug = getTenantSlug(doc.tenant, tenantSlugMap)
      const rootTenant = isMainTenant(tenantSlug)

      return {
        group: rootTenant ? 'root-wordpress-posts' : 'tenant-wordpress-posts',
        loc: rootTenant ? `${siteBase}/blog/${slug}` : `${siteBase}/${tenantSlug}/blog/${slug}`,
        lastmod: typeof doc.updatedAt === 'string' && doc.updatedAt ? doc.updatedAt : fallbackDate,
      }
    })
    .filter((entry): entry is SitemapEntry => Boolean(entry))
}

function buildArtifactsFromEntries(entries: SitemapEntry[]): PersistedArtifact[] {
  const siteBase = getFrontendSiteBase()
  const generatedAt = new Date().toISOString()
  const groups: SitemapGroup[] = [
    'root-pages',
    'tenant-pages',
    'root-posts',
    'tenant-posts',
    'root-wordpress-posts',
    'tenant-wordpress-posts',
  ]

  const artifacts: PersistedArtifact[] = []

  const indexItems = {
    pages: [] as Array<{ loc: string; lastmod: string }>,
    posts: [] as Array<{ loc: string; lastmod: string }>,
  }

  for (const group of groups) {
    const groupEntries = entries.filter((entry) => entry.group === group)
    const chunks = chunkEntries(groupEntries)

    chunks.forEach((chunk, index) => {
      const key = `sitemaps/${group}/${index}.xml`
      const lastmod = getLatestTimestamp(chunk.map((entry) => entry.lastmod))
      const loc = `${siteBase}/${key}`

      artifacts.push({
        key,
        xml: buildUrlsetXml(chunk),
        itemCount: chunk.length,
        generatedAt,
        contentType: SITEMAP_CONTENT_TYPE,
      })

      if (group === 'root-pages' || group === 'tenant-pages') {
        indexItems.pages.push({ loc, lastmod })
      } else {
        indexItems.posts.push({ loc, lastmod })
      }
    })
  }

  const pagesIndexXml = buildSitemapIndexXml(indexItems.pages)
  const postsIndexXml = buildSitemapIndexXml(indexItems.posts)
  const topIndexXml = buildSitemapIndexXml([
    {
      loc: `${siteBase}/pages-sitemap.xml`,
      lastmod: getLatestTimestamp(indexItems.pages.map((item) => item.lastmod)),
    },
    {
      loc: `${siteBase}/posts-sitemap.xml`,
      lastmod: getLatestTimestamp(indexItems.posts.map((item) => item.lastmod)),
    },
  ])

  artifacts.push(
    {
      key: 'pages-sitemap.xml',
      xml: pagesIndexXml,
      itemCount: indexItems.pages.length,
      generatedAt,
      contentType: SITEMAP_CONTENT_TYPE,
    },
    {
      key: 'posts-sitemap.xml',
      xml: postsIndexXml,
      itemCount: indexItems.posts.length,
      generatedAt,
      contentType: SITEMAP_CONTENT_TYPE,
    },
    {
      key: 'sitemap.xml',
      xml: topIndexXml,
      itemCount: 2,
      generatedAt,
      contentType: SITEMAP_CONTENT_TYPE,
    },
  )

  return artifacts
}

async function upsertArtifacts(payload: Payload, artifacts: PersistedArtifact[]): Promise<void> {
  const existing = (await payload.find({
    collection: ARTIFACT_COLLECTION,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
  } as never)) as PayloadFindResult<SitemapArtifactRecord>

  const existingByKey = new Map(
    (existing.docs || [])
      .filter((doc): doc is SitemapArtifactRecord & { key: string; id: string } => typeof doc.key === 'string' && typeof doc.id === 'string')
      .map((doc) => [doc.key, doc]),
  )

  const nextKeys = new Set(artifacts.map((artifact) => artifact.key))

  for (const artifact of artifacts) {
    const existingArtifact = existingByKey.get(artifact.key)

    if (existingArtifact) {
      const xmlUnchanged = existingArtifact.xml === artifact.xml
      const countUnchanged = existingArtifact.itemCount === artifact.itemCount
      const typeUnchanged = existingArtifact.contentType === artifact.contentType

      if (xmlUnchanged && countUnchanged && typeUnchanged) {
        continue
      }

      await payload.update({
        collection: ARTIFACT_COLLECTION,
        id: existingArtifact.id,
        data: artifact,
        overrideAccess: true,
      } as never)

      continue
    }

    await payload.create({
      collection: ARTIFACT_COLLECTION,
      data: artifact,
      overrideAccess: true,
    } as never)
  }

  for (const artifact of existing.docs || []) {
    if (!artifact?.id || !artifact?.key || nextKeys.has(artifact.key)) continue

    await payload.delete({
      collection: ARTIFACT_COLLECTION,
      id: artifact.id,
      overrideAccess: true,
    } as never)
  }
}

export async function regenerateAndPersistSitemaps(payload: Payload): Promise<string[]> {
  const tenantSlugMap = await fetchTenantSlugMap(payload)
  const [pages, posts, wordpressPosts] = await Promise.all([
    fetchAllPublishedDocs(payload, PAGES_COLLECTION, '_status'),
    fetchAllPublishedDocs(payload, POSTS_COLLECTION, '_status'),
    fetchAllPublishedDocs(payload, WORDPRESS_POSTS_COLLECTION, 'status'),
  ])

  const entries = [
    ...buildPageEntries(pages, tenantSlugMap),
    ...buildPostEntries(posts, tenantSlugMap),
    ...buildWordpressEntries(wordpressPosts, tenantSlugMap),
  ]

  const artifacts = buildArtifactsFromEntries(entries)
  await upsertArtifacts(payload, artifacts)
  return artifacts.map((artifact) => `/${artifact.key}`)
}

export async function getSitemapArtifact(
  payload: Payload,
  key: string,
  regenerateOnMiss = true,
): Promise<PersistedArtifact | null> {
  const findArtifact = async (): Promise<PersistedArtifact | null> => {
    const result = (await payload.find({
      collection: ARTIFACT_COLLECTION,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        key: {
          equals: key,
        },
      },
    } as never)) as PayloadFindResult<SitemapArtifactRecord>

    const artifact = result.docs?.[0]
    if (!artifact?.key || !artifact?.xml) return null

    return {
      key: artifact.key,
      xml: artifact.xml,
      itemCount: typeof artifact.itemCount === 'number' ? artifact.itemCount : 0,
      generatedAt: new Date().toISOString(),
      contentType: artifact.contentType || SITEMAP_CONTENT_TYPE,
    }
  }

  const existing = await findArtifact()
  if (existing || !regenerateOnMiss) return existing

  await regenerateAndPersistSitemaps(payload)
  return findArtifact()
}
