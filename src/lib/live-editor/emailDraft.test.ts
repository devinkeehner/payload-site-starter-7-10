import { describe, expect, it } from 'vitest'

import {
  assertCurrentDraftRevision,
  buildNativeEmailDraftPatch,
  isSameOriginDraftRequest,
  NativeDraftError,
  readNativeDraftRequest,
  type DraftBlock,
  type DraftField,
} from './emailDraft'

const updatedAt = '2026-11-06T12:00:00.000Z'
const imageBlock: DraftBlock = {
  slug: 'emailImage',
  fields: [
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'caption', type: 'text' },
    { name: 'extension', type: 'json' },
  ],
}
const fields: DraftField[] = [
  { name: 'title', type: 'text' },
  { type: 'tabs', tabs: [{ fields: [
    { name: 'subject', type: 'text' },
    { name: 'layout', type: 'blocks', blocks: [imageBlock, {
      slug: 'emailText', fields: [{ name: 'text', type: 'richText' }],
    }, {
      slug: 'emailLinks', fields: [{ name: 'items', type: 'array', fields: [{ name: 'link', type: 'relationship', relationTo: ['pages', 'posts'] }] }],
    }] },
  ] }] },
]

function rich(nodes: Array<Record<string, unknown>>) {
  return { root: { type: 'root', version: 1, children: [{ type: 'paragraph', version: 1, children: nodes }] } }
}

describe('native email draft patch', () => {
  it('writes only editable native content while preserving block metadata and opaque JSON', () => {
    const extension = { id: 'opaque-id', value: { id: 'keep-nested-id', url: '/untouched' }, type: 'upload', pending: true }
    const incoming = {
      id: 'forged-email', tenant: 'forged-site', status: 'sent', _status: 'published', updatedAt: 'forged',
      recipientEmail: 'someone@example.com', emailList: 'another-list', scheduledAt: updatedAt,
      contentRevision: 'forged', sendSummary: { sentAt: updatedAt }, lastSend: { status: 'sent' },
      title: 'Native campaign', subject: 'Subject', preheader: 'Preview', replyTo: 'reply@example.gov',
      layout: [{ id: 'native-row', blockType: 'emailImage', blockName: 'Header', image: { id: 'media-a', url: '/a.jpg', tenant: 'site-a' }, caption: 'Caption', extension, futureField: { id: 'future-id' } }],
    }
    const patch = buildNativeEmailDraftPatch(incoming, fields)
    expect(patch).toEqual({
      title: 'Native campaign', subject: 'Subject', preheader: 'Preview', replyTo: 'reply@example.gov',
      layout: [{ id: 'native-row', blockType: 'emailImage', blockName: 'Header', image: 'media-a', caption: 'Caption', extension, futureField: { id: 'future-id' } }],
    })
    expect(incoming.layout[0]?.image).toEqual({ id: 'media-a', url: '/a.jpg', tenant: 'site-a' })
    expect(patch.layout).not.toBe(incoming.layout)
  })

  it('normalizes polymorphic relationships inside native array rows', () => {
    const patch = buildNativeEmailDraftPatch({ layout: [{ id: 'links', blockType: 'emailLinks', items: [{ id: 'link-row', link: { relationTo: 'pages', value: { id: 'page-a', title: 'A page' } }, label: 'Learn more' }] }] }, fields)
    expect(patch).toEqual({ layout: [{ id: 'links', blockType: 'emailLinks', items: [{ id: 'link-row', link: { relationTo: 'pages', value: 'page-a' }, label: 'Learn more' }] }] })
  })

  it('resolves referenced blocks through the native registry', () => {
    const schema: DraftField[] = [{ name: 'layout', type: 'blocks', blockReferences: ['emailImage'] }]
    expect(buildNativeEmailDraftPatch({ layout: [{ blockType: 'emailImage', image: { id: 42, url: '/42.jpg' } }] }, schema, [imageBlock]))
      .toEqual({ layout: [{ blockType: 'emailImage', image: 42 }] })
  })

  it('normalizes populated native Lexical upload, relationship, and internal-link values', () => {
    const text = rich([
      { type: 'upload', relationTo: 'media', value: { id: 'media-a', url: '/a.jpg' }, fields: { alignment: 'center' } },
      { type: 'relationship', relationTo: 'posts', value: { id: 'post-a', title: 'News' } },
      { type: 'link', version: 3, fields: { linkType: 'internal', doc: { relationTo: 'pages', value: { id: 'page-a', title: 'About' } }, newTab: true }, children: [{ type: 'text', text: 'About', format: 1 }] },
    ])
    const patch = buildNativeEmailDraftPatch({ layout: [{ id: 'text-row', blockType: 'emailText', text }] }, fields)
    expect(patch).toEqual({ layout: [{ id: 'text-row', blockType: 'emailText', text: rich([
      { type: 'upload', relationTo: 'media', value: 'media-a', fields: { alignment: 'center' } },
      { type: 'relationship', relationTo: 'posts', value: 'post-a' },
      { type: 'link', version: 3, fields: { linkType: 'internal', doc: { relationTo: 'pages', value: 'page-a' }, newTab: true }, children: [{ type: 'text', text: 'About', format: 1 }] },
    ]) }] })
  })

  it('preserves unsupported block records and unsupported Lexical node payloads', () => {
    const unknown = { id: 'future-row', blockType: 'futureBlock', resource: { id: 'keep', url: '/keep' } }
    const text = rich([{ type: 'custom-widget', value: { id: 'opaque' }, children: [{ type: 'upload', value: { id: 'also-opaque' } }] }])
    expect(buildNativeEmailDraftPatch({ layout: [unknown, { blockType: 'emailText', text }] }, fields)).toEqual({ layout: [unknown, { blockType: 'emailText', text }] })
  })

  it('handles groups, named tabs, rows, collapsibles, and multi-value uploads', () => {
    const schema: DraftField[] = [{ name: 'layout', type: 'blocks', blocks: [{ slug: 'nested', fields: [
      { type: 'row', fields: [{ type: 'collapsible', fields: [{ name: 'settings', type: 'group', fields: [
        { type: 'tabs', tabs: [{ name: 'gallery', fields: [{ name: 'images', type: 'upload', relationTo: 'media', hasMany: true }] }] },
      ] }] }] },
    ] }] }]
    expect(buildNativeEmailDraftPatch({ layout: [{ blockType: 'nested', settings: { gallery: { images: [{ id: 'a' }, { relationTo: 'media', value: { id: 'b' } }] } } }] }, schema))
      .toEqual({ layout: [{ blockType: 'nested', settings: { gallery: { images: ['a', 'b'] } } }] })
  })

  it.each([
    null, [], { status: 'sent' }, { title: 42 }, { subject: null }, { replyTo: {} }, { layout: {} },
    { layout: ['not-a-block'] }, { layout: [{}] }, { layout: [{ blockType: 'emailImage', image: { url: '/unsaved.jpg' } }] },
    { layout: [{ blockType: 'emailLinks', items: [{ link: { relationTo: 'users', value: 'user-a' } }] }] },
  ])('rejects malformed or unsaved native content: %j', incoming => {
    expect(() => buildNativeEmailDraftPatch(incoming, fields)).toThrow(NativeDraftError)
  })

  it('rejects pending native rich uploads', () => {
    expect(() => buildNativeEmailDraftPatch({ layout: [{ blockType: 'emailText', text: rich([{ type: 'upload', relationTo: 'media', pending: true, value: { id: 'media-a' } }]) }] }, fields)).toThrow('Finish uploading')
  })

  it('permits explicitly clearing native layout and media', () => {
    expect(buildNativeEmailDraftPatch({ layout: null }, fields)).toEqual({ layout: null })
    expect(buildNativeEmailDraftPatch({ layout: [{ blockType: 'emailImage', image: null }] }, fields)).toEqual({ layout: [{ blockType: 'emailImage', image: null }] })
  })
})

describe('native draft request and revision validation', () => {
  it('requires an exact valid request envelope and revision token', () => {
    const email = { title: 'Native title' }
    expect(readNativeDraftRequest({ email, expectedUpdatedAt: updatedAt })).toEqual({ email, expectedUpdatedAt: updatedAt })
    expect(() => assertCurrentDraftRevision({ updatedAt }, updatedAt)).not.toThrow()
  })

  it.each([
    null, [], {}, { email: [] }, { email: {}, expectedUpdatedAt: '' },
    { email: {}, expectedUpdatedAt: 42 }, { email: {}, expectedUpdatedAt: 'yesterday' },
    { email: {}, expectedUpdatedAt: '2026-99-99T00:00:00.000Z' },
    { email: {}, expectedUpdatedAt: updatedAt, overrideAccess: true },
    { email: {}, expectedUpdatedAt: `${updatedAt}${' '.repeat(65)}` },
  ])('rejects malformed request schema: %j', body => {
    expect(() => readNativeDraftRequest(body)).toThrow(NativeDraftError)
  })

  it.each([{}, { updatedAt: null }, { updatedAt: '2026-11-06T12:01:00.000Z' }])('rejects a stale or absent current revision: %j', current => {
    expect(() => assertCurrentDraftRevision(current, updatedAt)).toThrow('changed after you opened it')
    try { assertCurrentDraftRevision(current, updatedAt) } catch (error) { expect(error).toMatchObject({ status: 409 }) }
  })
})

describe('native draft browser origin checks', () => {
  function request(headers: HeadersInit = {}) { return new Request('https://editor.example.gov/api/live-editor/emails/email-a', { headers }) }

  it('accepts a same-origin browser request and authenticated clients without Origin metadata', () => {
    expect(isSameOriginDraftRequest(request({ origin: 'https://editor.example.gov', 'sec-fetch-site': 'same-origin' }))).toBe(true)
    expect(isSameOriginDraftRequest(request())).toBe(true)
  })

  it('uses the externally forwarded origin for the deployed reverse proxy', () => {
    const proxied = new Request('http://localhost:3000/api/live-editor/emails/email-a', { headers: {
      origin: 'https://editor.example.gov', 'x-forwarded-host': 'editor.example.gov, internal.example', 'x-forwarded-proto': 'https, http',
    } })
    expect(isSameOriginDraftRequest(proxied)).toBe(true)
  })

  it.each([
    { origin: 'https://attacker.example' }, { origin: 'http://editor.example.gov' },
    { origin: 'https://editor.example.gov:8443' }, { origin: 'null' }, { origin: 'not-an-origin' },
    { origin: 'https://editor.example.gov', 'sec-fetch-site': 'cross-site' },
    { origin: 'https://editor.example.gov', 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'cross-site' },
  ])('rejects foreign or malformed browser origins: %j', headers => {
    expect(isSameOriginDraftRequest(request(headers as Record<string, string>))).toBe(false)
  })
})
