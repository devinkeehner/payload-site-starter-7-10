import type { PayloadRequest } from 'payload'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as roles from '@/lib/access/roles'
import { runDesignResource } from './designChatResources'
import { browseSiteGallery } from './siteGallery'
import { formFieldsToEditorLayout, editorLayoutToFormFields } from './formDocument'
import { getPlainTextFromLexical } from './lexical'

const tenant = 'site-a'
function fixture() {
  const find = vi.fn()
  const create = vi.fn()
  const req = { user: { id: 'editor', collection: 'users', roles: ['alphaTester'], tenants: [{ tenant }] },
    context: {}, payload: { find, create } } as unknown as PayloadRequest
  return { req, find, create, context: { req, tenantId: tenant } }
}
const contact = {
  title: 'Contact the office', submitButtonLabel: 'Send message', confirmationMessage: 'Thanks for reaching out.',
  fields: [
    { type: 'text', label: 'Your name', required: true, width: 'half' },
    { type: 'email', label: 'Email', required: true, width: 'half' },
    { type: 'select', label: 'Topic', options: ['Constituent services', 'Other'] },
    { type: 'textarea', label: 'Message', required: true },
  ],
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('site form tools', () => {
  it('creates an editable native Payload form and reuses it when requested again', async () => {
    const { req, find, create, context } = fixture()
    find.mockResolvedValue({ docs: [] })
    create.mockImplementation(async ({ data }) => {
      const doc = { ...data, id: 'contact' }
      find.mockResolvedValue({ docs: [doc], nextPage: null })
      return doc
    })
    const result = await runDesignResource(context, 'live_editor_create_form', contact)
    expect(JSON.parse(String(result))).toMatchObject({ created: true, formId: 'contact', title: contact.title })
    const { data } = create.mock.calls[0]![0]
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'forms', req, overrideAccess: false,
      context: { designChatFormKey: expect.stringMatching(/^[a-f0-9]{64}$/) } }))
    expect(data).toMatchObject({ tenant, enableHoneypot: true, confirmationType: 'message', emails: [], fields: [
      { blockType: 'text', name: 'yourName', width: 50, required: true }, { blockType: 'email', name: 'email', width: 50 },
      { blockType: 'select', name: 'topic', options: [{ label: 'Constituent services', value: 'Constituent services' }, { label: 'Other', value: 'Other' }] },
      { blockType: 'textarea', name: 'message', width: 100, required: true },
    ] })
    expect(getPlainTextFromLexical(data.confirmationMessage)).toBe(contact.confirmationMessage)
    expect(editorLayoutToFormFields(formFieldsToEditorLayout(data.fields))).toEqual(data.fields)
    expect(JSON.parse(String(await runDesignResource(context, 'live_editor_create_form', contact)))).toMatchObject({ created: false, formId: 'contact' })
    expect(JSON.parse(String(await runDesignResource(context, 'live_editor_find_forms', { query: 'office', page: 1 })))).toMatchObject({
      forms: [{ formId: 'contact', submitButtonLabel: 'Send message', fields: expect.arrayContaining([expect.objectContaining({ type: 'textarea', label: 'Message' })]) }],
    })
    await expect(runDesignResource(context, 'live_editor_create_form', { ...contact, confirmationMessage: 'Different confirmation' })).rejects.toThrow(/different form/)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('resolves concurrent creation to the winning form ID and does not duplicate names or reserved fields', async () => {
    const { find, create, context } = fixture()
    find.mockResolvedValueOnce({ docs: [] })
    create.mockImplementation(async ({ data }) => {
      find.mockResolvedValue({ docs: [{ ...data, id: 'winner' }] })
      throw new Error('duplicate key')
    })
    const inputs = ['Your name', 'Your name', 'Company website', 'Constructor'].map(label => ({ label, type: 'text' }))
    const result = JSON.parse(String(await runDesignResource(context, 'live_editor_create_form', {
      ...contact, confirmationMessage: 'Thank you!\r\n\r\n\r\nWe received your message.', fields: inputs,
    })))
    expect(result).toMatchObject({ created: false, formId: 'winner' })
    expect(result.fields.map((item: { name: string }) => item.name)).toEqual(['yourName', 'yourName2', 'companyWebsite2', 'constructor2'])
  })

  it('enforces the signed-in site scope, validates choices and excludes other sites from discovery', async () => {
    const { req, find, create, context } = fixture()
    await expect(runDesignResource({ req, tenantId: 'site-b' }, 'live_editor_create_form', contact)).rejects.toMatchObject({ status: 403 })
    await expect(runDesignResource(context, 'live_editor_create_form', { ...contact, fields: [{ type: 'radio', label: 'Ready?' }] })).rejects.toThrow(/options/)
    await expect(runDesignResource(context, 'live_editor_create_form', { ...contact, tenant: 'site-b' })).rejects.toThrow()
    expect(find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    find.mockResolvedValue({ docs: [{ id: 'other', title: 'Another site', tenant: { id: 'site-b' }, fields: [] }], nextPage: 2 })
    expect(JSON.parse(String(await runDesignResource(context, 'live_editor_find_forms', {})))).toEqual({ forms: [], nextPage: 2 })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'forms', req, overrideAccess: false, where: { and: [{ tenant: { equals: tenant } }] } }))
  })

  it('checks collection permissions before querying either library or creating a form', async () => {
    const { req, find, create, context } = fixture()
    const access = vi.spyOn(roles, 'canAccessCollection').mockReturnValue(false)
    await expect(runDesignResource(context, 'live_editor_find_forms', {})).rejects.toMatchObject({ status: 403 })
    await expect(runDesignResource(context, 'live_editor_create_form', contact)).rejects.toMatchObject({ status: 403 })
    await expect(browseSiteGallery(req, tenant, {})).rejects.toMatchObject({ status: 403 })
    expect(access.mock.calls).toEqual([[req.user, 'forms'], [req.user, 'forms'], [req.user, 'media']])
    expect(find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('visual gallery', () => {
  it('passes actual bounded JPEG pixels to the model alongside the right media ID, supporting discovery and detail', async () => {
    const { req, find } = fixture()
    const png = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#cf172f' } }).png().toBuffer()
    const fetchImage = vi.fn(async (_url: URL) => new Response(new Uint8Array(png)))
    vi.stubGlobal('fetch', fetchImage)
    const photo = { id: 'photo', tenant: { id: tenant }, mimeType: 'image/png', filename: 'staff.png', alt: 'Team photo', width: 1200, height: 600,
      url: 'https://media.cthousegop.com/staff.png', sizes: { thumbnail: { url: 'https://media.cthousegop.com/small.png' }, medium: { url: 'https://media.cthousegop.com/medium.png' } } }
    find.mockResolvedValue({ docs: [photo, { ...photo, id: 'other-photo', tenant: 'site-b' }], page: 1, nextPage: 2, totalDocs: 10 })
    const preview = await browseSiteGallery(req, tenant, { query: 'team', page: 1 })
    const detail = await browseSiteGallery(req, tenant, { mediaId: 'photo' })
    for (const [output, width] of [[preview, 360], [detail, 900]] as const) {
      expect(output).toHaveLength(3)
      expect(output[1]).toMatchObject({ type: 'text', text: expect.stringContaining('"mediaId":"photo"') })
      const image = output[2]
      expect(image).toMatchObject({ type: 'image', detail: width === 360 ? 'low' : 'high' })
      if (image?.type !== 'image' || typeof image.image !== 'string') throw new Error('Missing image payload')
      const pixels = sharp(Buffer.from(image.image.split(',')[1]!, 'base64'))
      expect(await pixels.metadata()).toMatchObject({ format: 'jpeg', width, height: width / 2 })
      const [red, green, blue] = await pixels.resize(1, 1).raw().toBuffer()
      expect(red).toBeCloseTo(207, -1)
      expect(green).toBeCloseTo(23, -1)
      expect(blue).toBeCloseTo(47, -1)
    }
    expect(find.mock.calls[0]![0]).toMatchObject({ collection: 'media', req, overrideAccess: false, page: 1, limit: 6,
      where: { and: expect.arrayContaining([{ tenant: { equals: tenant } }, { or: [{ alt: { like: 'team' } }, { filename: { like: 'team' } }] }]) } })
    expect(find.mock.calls[1]![0]).toMatchObject({ limit: 1, where: { and: expect.arrayContaining([{ id: { equals: 'photo' } }]) } })
    expect(fetchImage).toHaveBeenCalledTimes(2)
    expect(String(fetchImage.mock.calls[0]?.[0])).toContain('small.png')
    expect(String(fetchImage.mock.calls[1]?.[0])).toContain('medium.png')
  })

  it('uses metadata only for unavailable pixels and never fetches unrelated URLs', async () => {
    const { req, find } = fixture()
    const fetchImage = vi.fn()
    vi.stubGlobal('fetch', fetchImage)
    find.mockResolvedValue({ docs: [{ id: 'photo', tenant, mimeType: 'image/jpeg', url: 'https://unrelated.example/photo.jpg' }] })
    const output = await browseSiteGallery(req, tenant, {})
    expect(output).toHaveLength(2)
    expect(output[1]).toMatchObject({ type: 'text', text: expect.stringContaining('"imageAvailable":false') })
    expect(fetchImage).not.toHaveBeenCalled()
    await expect(browseSiteGallery(req, 'another-site', {})).rejects.toMatchObject({ status: 403 })
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('loads private file URLs from the CMS and keeps session headers on the CMS file route', async () => {
    const { req, find } = fixture()
    const cms = 'https://cms.example.test'
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://public.example.test')
    vi.stubEnv('NEXT_PUBLIC_PAYLOAD_URL', cms)
    const scoped = Object.assign(req, { url: cms + '/api/live-editor/pages/page/design-chat', headers: new Headers({ cookie: 'payload-token=test' }) })
    const image = await sharp({ create: { width: 2, height: 1, channels: 3, background: 'green' } }).png().toBuffer()
    const fetchImage = vi.fn(async (_url: URL, _init: RequestInit) => new Response(new Uint8Array(image)))
    vi.stubGlobal('fetch', fetchImage)
    const record = { tenant, mimeType: 'image/png', filename: 'office.png' }
    find.mockResolvedValue({ docs: [
      { ...record, id: 'private', url: '/api/media/file/office.png' },
      { ...record, id: 'public', url: 'https://media.cthousegop.com/api/media/file/office.png' },
    ] })
    const output = await browseSiteGallery(scoped, tenant, {})
    expect(output.filter(item => item.type === 'image')).toHaveLength(2)
    const [local, localOptions] = fetchImage.mock.calls[0]!
    const [cdn, cdnOptions] = fetchImage.mock.calls[1]!
    expect(local.href).toBe(cms + '/api/media/file/office.png')
    expect(new Headers(localOptions.headers).get('cookie')).toBe('payload-token=test')
    expect(cdn.origin).toBe('https://media.cthousegop.com')
    expect(new Headers(cdnOptions.headers).get('cookie')).toBeNull()
    expect(localOptions).toMatchObject({ redirect: 'error', cache: 'no-store' })
  })
})
