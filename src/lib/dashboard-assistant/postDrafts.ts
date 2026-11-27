import type { PayloadRequest, Where } from 'payload'
import { z } from 'zod-v4'
import type { Post } from '@/payload-types'
import { relationshipID } from '@/lib/live-editor/emailAccess'
import { createLexicalValueFromText, getPlainTextFromLexical } from '@/lib/live-editor/lexical'
import { dashboardTransaction, DashboardInputError, local } from './access'

export const postDraftChanges = z.array(z.union([
  z.object({ action: z.literal('set_title'), value: z.string().trim().min(1).max(280) }).strict(),
  z.object({ action: z.literal('set_search_title'), value: z.string().trim().min(1).max(180) }).strict(),
  z.object({ action: z.literal('set_search_description'), value: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal('set_takeaways'), values: z.array(z.string().trim().min(1).max(400)).length(4) }).strict(),
  z.object({
    action: z.literal('replace_text'),
    from: z.string().min(1).max(4_000).regex(/^[^\r\n]+$/),
    to: z.string().max(4_000).regex(/^[^\r\n]*$/),
  }).strict(),
  z.object({
    action: z.literal('replace_body'),
    paragraphs: z.array(z.string().trim().min(1).max(4_000)).min(1).max(40),
  }).strict(),
])).max(20)

const summaryFields = { title: true, slug: true, tenant: true, _status: true, updatedAt: true } as const
const detailFields = { ...summaryFields, content: true, layout: true, meta: true, keyTakeaways: true } as const

function summary(req: PayloadRequest, post: Pick<Post, 'id' | 'title' | 'slug' | 'updatedAt'>) {
  return {
    id: post.id, title: post.title, slug: post.slug, updatedAt: post.updatedAt,
    editUrl: `${req.payload.config.routes.admin}/collections/posts/${encodeURIComponent(post.id)}`,
  }
}

async function loadPostRevision(req: PayloadRequest, siteId: string, postId: string) {
  const post = await req.payload.findByID({
    ...local(req), collection: 'posts', id: postId, draft: true, disableErrors: true, select: detailFields,
  })
  if (!post || relationshipID(post.tenant) !== siteId || (post._status !== 'draft' && post._status !== 'published')) {
    throw new DashboardInputError('No editable post with that ID was found on the selected site.')
  }
  return post
}

export async function findPostDrafts(req: PayloadRequest, siteId: string, { postId, query }: { postId: string | null; query: string }) {
  if (postId) {
    const post = await loadPostRevision(req, siteId, postId)
    const body = getPlainTextFromLexical(post.content)
    return {
      ...summary(req, post), status: post._status, body: body.slice(0, 24_000), bodyTruncated: body.length > 24_000,
      hasLayout: Boolean(post.layout?.length),
      searchTitle: post.meta?.title, searchDescription: post.meta?.description,
      takeaways: post.keyTakeaways?.map(row => row.point),
    }
  }
  const filters: Where[] = [{ tenant: { equals: siteId } }, { _status: { equals: 'draft' } }]
  if (query.trim()) filters.push({ or: [{ title: { like: query.trim() } }, { slug: { like: query.trim() } }] })
  const result = await req.payload.find({
    ...local(req), collection: 'posts', draft: true, where: { and: filters },
    sort: '-updatedAt', limit: 12, select: summaryFields,
  })
  return {
    drafts: result.docs.filter(post => post._status === 'draft' && relationshipID(post.tenant) === siteId).map(post => summary(req, post)),
    hasNextPage: result.hasNextPage,
  }
}

function replaceUniqueText(content: Post['content'] | undefined, from: string, to: string) {
  const draft = structuredClone(content)
  if (!draft?.root) throw new DashboardInputError('This draft has no rich-text body to edit.')
  let match: { text: string } | undefined
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    const node = value as { type?: string; text?: string; children?: unknown[] }
    const text = node.text
    if (node.type === 'text' && typeof text === 'string' && text.includes(from)) {
      if (match || text.indexOf(from) !== text.lastIndexOf(from)) {
        throw new DashboardInputError('The text occurs more than once. Use a longer quotation from one text segment.')
      }
      match = node as { text: string }
    }
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }
  visit(draft.root)
  if (!match) throw new DashboardInputError('That exact text was not found in one text segment. Read the current draft before retrying.')
  const at = match.text.indexOf(from)
  match.text = match.text.slice(0, at) + to + match.text.slice(at + from.length)
  return draft
}

export async function updatePostDraft(req: PayloadRequest, siteId: string, input: {
  postId: string; expectedUpdatedAt: string; changes: z.infer<typeof postDraftChanges>
}, signal?: AbortSignal) {
  return dashboardTransaction(req, async () => {
    const post = await loadPostRevision(req, siteId, input.postId)
    if (post.updatedAt !== input.expectedUpdatedAt) throw new DashboardInputError('The post or its draft changed. Read the latest revision before editing.')
    if (!input.changes.length && post._status === 'draft') {
      return { ...summary(req, post), status: post._status, startedRevision: false }
    }
    const data: Partial<Post> = { _status: 'draft' }
    for (const edit of input.changes) {
      switch (edit.action) {
        case 'set_title':
          data.title = edit.value
          if (post.slug) data.slug = post.slug
          break
        case 'set_search_title':
          data.meta = { ...(data.meta ?? post.meta), title: edit.value }
          break
        case 'set_search_description':
          data.meta = { ...(data.meta ?? post.meta), description: edit.value, descriptionApproved: false }
          break
        case 'set_takeaways':
          data.keyTakeaways = edit.values.map(point => ({ point }))
          data.keyTakeawaysApproved = false
          break
        case 'replace_text':
          data.content = replaceUniqueText(data.content ?? post.content, edit.from, edit.to)
          break
        case 'replace_body':
          data.content = { root: { ...createLexicalValueFromText('').root,
            children: edit.paragraphs.map(paragraph => createLexicalValueFromText(paragraph).root.children[0]!),
          } }
          break
      }
    }
    signal?.throwIfAborted()
    const updated = await req.payload.update({
      ...local(req), collection: 'posts', id: post.id, overrideLock: false, draft: true, data, select: summaryFields,
    })
    return { ...summary(req, updated), status: updated._status, startedRevision: post._status === 'published' }
  })
}
