import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { shareDocumentToTenants } from './mcp-tenant-shares'

const sourceTenant = { id: 'source-site', slug: 'source' }
const north = { id: 'north-site', slug: 'north' }
const south = { id: 'south-site', slug: 'south' }
const targets = [north, south]
const mediaOrigin = 'https://media.example.test'
const clickDestination = 'https://example.test/district-event'

const sourceMedia = [
  { id: 'hero', filename: 'Café #1.jpg', alt: 'District event', mimeType: 'image/jpeg', bytes: [255, 216, 1], focalX: 28, focalY: 73 },
  { id: 'video', filename: 'Meeting.mp4', alt: 'Meeting recording', mimeType: 'video/mp4', bytes: [0, 0, 1, 2] },
  { id: 'thumbnail', filename: 'Meeting poster.png', alt: 'Meeting poster', mimeType: 'image/png', bytes: [137, 80, 78, 71] },
].map((media) => ({
  ...media,
  prefix: 'district assets/2026/',
  url: `/api/media/file/${media.filename}`,
  filesize: media.bytes.length,
  tenant: sourceTenant.id,
}))

const upload = (value: string) => ({ type: 'upload', relationTo: 'media', value })
const richText = (...children: unknown[]) => ({ root: { type: 'root', children } })

const form = {
  id: 'source-form',
  tenant: sourceTenant.id,
  title: 'Contact the district office',
  enableHoneypot: false,
  enableTurnstile: true,
  enableIContactSync: false,
  enableIntro: true,
  introContent: richText(upload('hero')),
  confirmationType: 'message',
  confirmationMessage: richText(upload('hero')),
  fields: [{ id: 'source-field', blockType: 'message', message: richText(upload('thumbnail')) }],
  submitButtonLabel: 'Send feedback',
}
const formBlock = { type: 'block', fields: { blockType: 'formBlock', form: form.id } }

const post = {
  id: 'source-post',
  tenant: sourceTenant.id,
  title: 'Latest saved draft',
  slug: 'district-event',
  heroSource: 'upload',
  heroImage: 'hero',
  heroImageLinkURL: clickDestination,
  meta: { image: 'hero', title: 'District event', description: 'Details from the district office.' },
  content: richText(upload('hero'), formBlock, formBlock),
  layout: [{
    blockType: 'emailGrid',
    layout: 'twoColumns',
    leftBlocks: [{ blockType: 'emailImage', media: 'hero', href: clickDestination }],
    rightBlocks: [{
      blockType: 'emailVideo', title: 'Meeting recording', videoMedia: { id: 'video' },
      thumbnailMedia: 'thumbnail', thumbnailAlt: 'District meeting',
    }],
  }],
}

type ScopedRequest = { tenant?: string; file?: unknown }

type DocumentRead = { collection: string; id: string; draft?: boolean; req?: ScopedRequest }
type DocumentCreate = {
  collection: string
  data: Record<string, unknown> & { tenant: string; prefix?: string }
  draft?: boolean
  req: ScopedRequest
  file?: { data: Buffer; name: string; size: number; mimetype: string }
}

function fixture() {
  const tenants = [sourceTenant, ...targets]
  const created: Array<DocumentCreate & { id: string }> = []

  const findByID = vi.fn(async ({ collection, id, draft }: DocumentRead) => {
    if (collection === 'tenants') {
      const tenant = tenants.find((candidate) => candidate.id === id)
      if (tenant) return tenant
    }
    if (collection === 'posts' && id === post.id) {
      return draft ? post : { ...post, title: 'Published snapshot', layout: [] }
    }
    if (collection === 'forms' && id === form.id) return form
    if (collection === 'media') {
      const medium = sourceMedia.find((candidate) => candidate.id === id)
      if (medium) return medium
    }
    throw new Error(`${collection} ${id} not found`)
  })

  const create = vi.fn(async (args: DocumentCreate) => {
    const { collection, data, file, req } = args
    if (file) req.file = file
    const count = created.filter((entry) => entry.data.tenant === data.tenant && entry.collection === collection).length
    const id = `${data.tenant}-${collection}-${count + 1}`
    created.push({ ...args, id })
    return { ...data, id }
  })

  const sourceDownloads = new Map<string, (typeof sourceMedia)[number]>(sourceMedia.map((medium) => {
    const escapedName = encodeURIComponent(medium.filename)
    return [`${mediaOrigin}/district%20assets/2026/${escapedName}`, medium] as const
  }))
  const fetchMedia = vi.fn(async (input: string | URL) => {
    const medium = sourceDownloads.get(String(input))
    if (!medium) return new Response(null, { status: 404 })
    return new Response(Uint8Array.from(medium.bytes), {
      headers: { 'Content-Type': medium.mimeType, 'Content-Length': String(medium.filesize) },
    })
  })

  vi.stubEnv('R2_PUBLIC_BASE_URL', `${mediaOrigin}/`)
  vi.stubGlobal('fetch', fetchMedia)
  const request = {
    context: {},
    payload: { findByID, find: vi.fn(async () => ({ docs: [] })), create },
    tenant: sourceTenant.id,
    user: { roles: ['super'] },
  }

  return { created, fetchMedia, findByID, request, req: request as unknown as PayloadRequest }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('sharing documents between sites', () => {
  it('copies the latest post draft and stores each distinct image and video once per target', async () => {
    const { created, fetchMedia, findByID, request, req } = fixture()

    const result = await shareDocumentToTenants({
      collection: 'posts', docId: post.id, req,
      tenantIDs: [sourceTenant.id, north.id, 'missing-site', south.id],
    })

    expect(result).toEqual({
      count: 2,
      results: [
        { tenantID: sourceTenant.id, skipped: true, reason: 'same-tenant' },
        { tenantID: north.id, id: `${north.id}-posts-1`, slug: post.slug, _status: 'draft' },
        { tenantID: 'missing-site', error: expect.any(String) },
        { tenantID: south.id, id: `${south.id}-posts-1`, slug: post.slug, _status: 'draft' },
      ],
    })

    const postReads = findByID.mock.calls.filter(([args]) => args.collection === 'posts' && args.id === post.id)
    expect(postReads).toEqual([[expect.objectContaining({ draft: true })]])
    expect(fetchMedia.mock.calls.map(([url]) => String(url)))
      .toContain(`${mediaOrigin}/district%20assets/2026/Caf%C3%A9%20%231.jpg`)

    for (const target of targets) {
      const writes = created.filter(({ data }) => data.tenant === target.id)
      const mediaWrites = writes.filter(({ collection }) => collection === 'media')
      expect(mediaWrites).toHaveLength(sourceMedia.length)
      const mediaIDs = new Map<string, string>()
      for (const medium of sourceMedia) {
        const write = mediaWrites.find(({ data }) => data.alt === medium.alt)
        expect(write?.data).toMatchObject({ tenant: target.id })
        expect(write?.data.prefix?.replace(/\/$/, '')).toBe(target.slug)
        expect(write?.file).toMatchObject({ data: Buffer.from(medium.bytes), size: medium.filesize, mimetype: medium.mimeType })
        expect(write?.req.tenant).toBe(target.id)
        if (medium.focalX !== undefined) {
          expect(write?.data).toMatchObject({ focalX: medium.focalX, focalY: medium.focalY })
        }
        mediaIDs.set(medium.id, write?.id || '')
      }
      expect(new Set(mediaWrites.map(({ req: uploadRequest }) => uploadRequest)).size).toBe(mediaWrites.length)

      const formWrites = writes.filter(({ collection }) => collection === 'forms')
      expect(formWrites).toHaveLength(1)
      const formId = formWrites[0]?.id
      const postWrite = writes.find(({ collection }) => collection === 'posts')
      expect(postWrite).toMatchObject({
        draft: true,
        data: {
          title: post.title, tenant: target.id, slug: post.slug, _status: 'draft',
          heroImage: mediaIDs.get('hero'), heroImageLinkURL: clickDestination,
          meta: { ...post.meta, image: mediaIDs.get('hero') },
          content: richText(
            upload(mediaIDs.get('hero') || ''),
            { type: 'block', fields: { blockType: 'formBlock', form: formId } },
            { type: 'block', fields: { blockType: 'formBlock', form: formId } },
          ),
          layout: [{
            blockType: 'emailGrid', layout: 'twoColumns',
            leftBlocks: [{ blockType: 'emailImage', media: mediaIDs.get('hero'), href: clickDestination }],
            rightBlocks: [{
              blockType: 'emailVideo', title: 'Meeting recording', videoMedia: mediaIDs.get('video'),
              thumbnailMedia: mediaIDs.get('thumbnail'), thumbnailAlt: 'District meeting',
            }],
          }],
        },
      })
    }
    expect(request).not.toHaveProperty('file')
    expect(request.tenant).toBe(sourceTenant.id)
  })

  it('preserves standalone form toggles and remaps media in each rich-text field', async () => {
    const { created, req } = fixture()
    const result = await shareDocumentToTenants({
      collection: 'forms', docId: form.id, req, tenantIDs: [north.id],
    })

    expect(result).toEqual({
      count: 1,
      results: [{ tenantID: north.id, id: `${north.id}-forms-1`, _status: 'draft' }],
    })
    const heroId = created.find(({ data }) => data.alt === sourceMedia[0]?.alt)?.id || ''
    const thumbnailId = created.find(({ data }) => data.alt === sourceMedia[2]?.alt)?.id || ''
    expect(heroId).toBeTruthy()
    expect(thumbnailId).toBeTruthy()
    expect(created.filter(({ collection }) => collection === 'media')).toHaveLength(2)
    expect(created.find(({ collection }) => collection === 'forms')).toMatchObject({
      data: {
        tenant: north.id,
        title: form.title,
        enableHoneypot: false,
        enableTurnstile: true,
        enableIntro: true,
        introContent: richText(upload(heroId)),
        confirmationMessage: richText(upload(heroId)),
        fields: [{ blockType: 'message', message: richText(upload(thumbnailId)) }],
        submitButtonLabel: form.submitButtonLabel,
      },
    })
  })
})
