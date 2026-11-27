import { createHash } from 'node:crypto'
import type { PayloadRequest } from 'payload'
import { z } from 'zod-v4'
import type { Post } from '@/payload-types'
import { formatSlug } from '@/collections/fields/slug/formatSlug'
import { relationshipID } from '@/lib/live-editor/emailAccess'
import { createLexicalValueFromText } from '@/lib/live-editor/lexical'
import { assertDashboardSite, dashboardAccount, DashboardInputError, local } from './access'

export const draftCopy = z.object({
  title: z.string().trim().min(1).max(280),
  paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(40),
  searchTitle: z.string().trim().min(1).max(180),
  searchDescription: z.string().trim().min(1).max(500),
  takeaways: z.array(z.string().trim().min(1).max(400)).length(4),
  categoryId: z.string().min(1).max(160),
  articleTypeId: z.string().min(1).max(160),
}).strict()

const profileFields = { tenant: true, name: true, districtNumber: true, officeTitle: true, towns: { town: true } } as const

export async function getReleaseOptions(req: PayloadRequest) {
  const { assignedIds } = await dashboardAccount(req)
  const common = { ...local(req), pagination: false } as const
  const [sites, reps, categories, articleTypes] = await Promise.all([
    req.payload.find({ ...common, collection: 'tenants', where: { and: [{ id: { in: assignedIds } }, { archived: { not_equals: true } }] }, select: { name: true, slug: true }, limit: 500 }),
    req.payload.find({ ...common, collection: 'rep-info', where: { tenant: { in: assignedIds } }, select: profileFields, limit: 1000 }),
    req.payload.find({ ...common, collection: 'categories', select: { title: true }, limit: 1000, sort: 'title' }),
    req.payload.find({ ...common, collection: 'article-types', select: { title: true }, limit: 1000, sort: 'title' }),
  ])
  const representatives = sites.docs.map(site => {
    const profiles = reps.docs.filter(profile => relationshipID(profile.tenant) === site.id)
    const profile = profiles.length === 1 ? profiles[0] : null
    return { siteId: site.id, site: site.name, slug: site.slug,
      representative: profile ? { name: profile.name, officeTitle: profile.officeTitle, district: profile.districtNumber, towns: profile.towns?.map(row => row.town) } : null }
  })
  return { representatives, categories: categories.docs, articleTypes: articleTypes.docs }
}

type Profile = { name: string; officeTitle: string; districtNumber: number; towns?: { town: string }[] | null }
export function personalize(value: string, profile: Profile) {
  const tokens: Record<string, string> = {
    name: profile.name?.trim(), officeTitle: profile.officeTitle?.trim(),
    district: profile.districtNumber == null ? '' : String(profile.districtNumber),
    towns: new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(profile.towns?.map(row => row.town.trim()).filter(Boolean) ?? []),
  }
  return value.replace(/\{([^{}]*)\}/gu, (_all, key: string) => {
    if (!Object.hasOwn(tokens, key) || !tokens[key]) throw new DashboardInputError(`No verified profile value for {${key}}.`)
    return tokens[key]
  })
}

export async function createReleaseDraft(req: PayloadRequest, siteId: string, runId: string, copy: z.infer<typeof draftCopy>) {
  await assertDashboardSite(req, siteId, true)
  const key = createHash('sha256').update(JSON.stringify([req.user!.id, runId, siteId])).digest('hex')
  const existing = async () => {
    const result = await req.payload.find({
      ...local(req), collection: 'posts', draft: true, limit: 1,
      select: { title: true, tenant: true, _status: true, meta: { image: true } },
      where: { and: [{ tenant: { equals: siteId } }, { dashboardDraftKey: { equals: key } }] },
    })
    return result.docs[0]
  }
  const response = (doc: { id: string; title?: string; _status?: string | null; meta?: { image?: unknown } }, created: boolean) => ({
    siteId, id: doc.id, title: doc.title, status: doc._status, created, imageMissing: !relationshipID(doc.meta?.image),
    editUrl: `/admin/collections/posts/${encodeURIComponent(doc.id)}`,
  })
  const prior = await existing()
  if (prior) return response(prior, false)

  const common = { ...local(req), where: { tenant: { equals: siteId } } }
  const { docs: profiles } = await req.payload.find({ ...common, collection: 'rep-info', select: profileFields, limit: 2 })
  if (profiles.length !== 1 || relationshipID(profiles[0]?.tenant) !== siteId) throw new DashboardInputError('A single representative profile is required for a personalized draft.')
  const profile = profiles[0]!
  const render = (text: string) => personalize(text, profile)

  const category = await req.payload.findByID({ ...local(req), collection: 'categories', id: copy.categoryId, select: { title: true } })
  const articleType = await req.payload.findByID({ ...local(req), collection: 'article-types', id: copy.articleTypeId, select: { title: true } })
  if (!category || !articleType) throw new DashboardInputError('Choose existing category and article type IDs from the post options.')
  const settings = await req.payload.find({ ...common, collection: 'standard-media', select: { defaultFeaturedImage: true }, limit: 1 })
  const defaultImage = relationshipID(settings.docs[0]?.defaultFeaturedImage)
  const images = defaultImage ? await req.payload.find({ ...local(req), collection: 'media', limit: 1,
    where: { and: [{ id: { equals: defaultImage } }, { tenant: { equals: siteId } }, { mimeType: { like: 'image/' } }] },
    select: { mimeType: true, tenant: true },
  }) : null
  const asset = images?.docs[0]
  const image = asset?.mimeType?.startsWith('image/') && relationshipID(asset.tenant) === siteId ? asset.id : undefined
  const paragraphs = copy.paragraphs.map(line => ({ ...createLexicalValueFromText(render(line)).root.children[0]! }))
  const title = render(copy.title)
  const content = { root: { ...createLexicalValueFromText('').root, children: paragraphs } }
  // Drafts can omit the required social image. Payload's draft input only makes top-level fields optional.
  const meta = {
    title: render(copy.searchTitle), description: render(copy.searchDescription),
    descriptionApproved: false, ...(image && { image }),
  } satisfies Omit<Post['meta'], 'image'> & Partial<Pick<Post['meta'], 'image'>>
  const data = {
    title, tenant: siteId, content, dashboardDraftKey: key, _status: 'draft' as const,
    slug: `${formatSlug(title).slice(0, 100) || 'news'}-${key.slice(0, 8)}`,
    meta: meta as Post['meta'],
    categories: [category.id], articleType: articleType.id,
    keyTakeaways: copy.takeaways.map(point => ({ point: render(point) })), keyTakeawaysApproved: false,
  }
  try {
    const post = await req.payload.create({
      ...local(req), collection: 'posts', draft: true, data, context: { dashboardDraftKey: key },
      select: { title: true, _status: true, meta: { image: true } },
    })
    return response(post, true)
  } catch (error) {
    // A simultaneous retry can have committed even though this create failed.
    const completed = await existing()
    if (completed) return response(completed, false)
    throw error
  }
}
