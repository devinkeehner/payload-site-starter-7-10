import { RunContext } from '@openai/agents'
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { getPlainTextFromLexical } from '@/lib/live-editor/lexical'
import { buildDashboardAssistantTools } from './tools'

const revision = '2026-11-27T12:00:00.000Z'
const oldRevision = '2026-11-26T12:00:00.000Z'
const draft = {
  title: '{name} shares district news',
  paragraphs: ['{officeTitle} {name} represents District {district}.', 'The district includes {towns}.'],
  searchTitle: '{name} | District {district} news',
  searchDescription: 'An update for residents of {towns}.',
  takeaways: ['District {district}', '{officeTitle} {name}', 'Communities include {towns}', 'Read the release'],
  categoryId: 'news',
  articleTypeId: 'release',
}

function harness(assigned = ['one', 'two'], selected = 'one', roles: string[] = []) {
  const account = {
    id: 'editor', roles, updatedAt: revision,
    tenants: assigned.map(tenant => ({ tenant, id: 'row-' + tenant })),
  }
  const payload = {
    db: {
      beginTransaction: vi.fn().mockResolvedValue('transaction'),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    },
    findByID: vi.fn(async ({ collection, id }) => collection === 'users' ? account : { id }),
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  }
  const req = { user: { collection: 'users', id: account.id },
    payload: { ...payload, config: { routes: { admin: '/admin' } } },
  } as unknown as PayloadRequest
  const tools = buildDashboardAssistantTools({ req, runId: 'release-turn', selectedTenantId: selected })
  const invoke = (name: string, args: unknown) => {
    const action = tools.find(tool => tool.name === name)
    if (!action) throw new Error('Missing tool ' + name)
    return action.invoke(new RunContext({}), JSON.stringify(args))
  }
  return { account, invoke, payload, req }
}

describe('dashboard settings and shortcuts', () => {
  const reference = { type: 'reference', label: 'Events', reference: { relationTo: 'pages', value: 'events-page' } }
  const navbar = {
    id: 'menu', tenant: 'one', updatedAt: revision,
    navItems: [
      { id: 'about', link: { label: 'About', type: 'custom', url: '/about' }, subNav: [{ id: 'events', link: reference }] },
      { id: 'contact', link: { label: 'Contact', type: 'custom', url: '/contact' } },
    ],
  }
  const banner = { id: 'settings', tenant: 'one', updatedAt: revision, bannerImage: 'old' }
  const move = { action: 'move', id: 'about', parentId: 'contact', beforeId: null }

  it('relevels nested navbar links while preserving references, sibling order and unrelated rows', async () => {
    const { invoke, payload, req } = harness()
    payload.find.mockImplementation(async ({ collection }) => ({ docs: [collection === 'navbars' ? navbar : banner] }))
    payload.update.mockImplementation(async ({ data }) => ({ ...navbar, ...data }))
    const changes = [
      move,
      { action: 'edit', id: 'events', label: 'Community events', url: null, newTab: null },
      { action: 'add', parentId: 'contact', beforeId: 'about', label: 'Visit', url: '/visit', newTab: true },
    ]
    await invoke('edit_site_navbar', { expectedUpdatedAt: revision, changes })
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      req, overrideAccess: false, overrideLock: false, collection: 'navbars', id: 'menu',
      data: { navItems: [{ ...navbar.navItems[1], subNav: [
        { link: { type: 'custom', label: 'Visit', url: '/visit', newTab: true }, newTab: true },
        { id: 'about', link: navbar.navItems[0]!.link, subSubNav: [{ id: 'events', link: { ...reference, label: 'Community events' } }] },
      ] }] },
    }))
    expect(navbar.navItems[0]!.subNav![0]!.link.label).toBe('Events')
    expect(payload.db.commitTransaction).toHaveBeenCalledWith('transaction')
  })

  it('rejects a stale navbar revision or a move into the item’s own subtree', async () => {
    const { invoke, payload } = harness()
    payload.find.mockImplementation(async ({ collection }) => ({ docs: collection === 'navbars' ? [navbar] : [] }))
    expect(await invoke('edit_site_navbar', { expectedUpdatedAt: oldRevision, changes: [move] })).toMatch(/navbar changed/)
    expect(await invoke('edit_site_navbar', { expectedUpdatedAt: revision, changes: [{ ...move, parentId: 'events' }] })).toMatch(/parent/)
    expect(payload.update).not.toHaveBeenCalled()
    expect(payload.db.rollbackTransaction).toHaveBeenCalledTimes(2)
  })

  it('changes just the current site’s banner and checks the actual image and revision', async () => {
    const { invoke, payload, req } = harness()
    const image = { id: 'new', mimeType: 'image/png', tenant: 'two' }
    payload.find.mockImplementation(async ({ collection }) => ({
      docs: collection === 'standard-media' ? [banner] : collection === 'media' ? [image] : [],
    }))
    payload.update.mockResolvedValue({ ...banner, bannerImage: image.id })
    const change = { expectedUpdatedAt: revision, mediaId: image.id }
    expect(await invoke('set_site_banner', change)).toMatch(/this site/)
    image.tenant = 'one'
    expect(await invoke('set_site_banner', { ...change, expectedUpdatedAt: oldRevision })).toMatch(/changed/)
    expect(payload.update).not.toHaveBeenCalled()
    expect(await invoke('set_site_banner', change)).toMatchObject({ siteId: 'one', bannerImage: 'new' })
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      req, overrideAccess: false, overrideLock: false, collection: 'standard-media', id: banner.id, data: { bannerImage: image.id },
    }))
  })

  it('lets an editor update the selected site without adding a shortcut', async () => {
    const { invoke, payload, req } = harness(['two'])
    payload.find.mockImplementation(async ({ collection }) => ({ docs: collection === 'navbars' ? [navbar] : [] }))
    payload.update.mockImplementation(async ({ data }) => ({ ...navbar, ...data }))

    expect(await invoke('edit_site_navbar', { expectedUpdatedAt: revision, changes: [move] })).toMatchObject({
      siteId: 'one', navbarId: 'menu',
    })
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ req, collection: 'navbars', id: 'menu', overrideAccess: false }))
    expect(payload.findByID).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'users' }))
  })

  it('rejects edits when the selected site is archived', async () => {
    const { invoke, payload } = harness()
    payload.findByID.mockImplementationOnce(async () => ({ id: 'one', archived: true }))
    expect(await invoke('edit_site_navbar', { expectedUpdatedAt: revision, changes: [move] })).toMatch(/archived/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('preserves unrelated shortcuts and keeps the bulk draft roster fixed for the current turn', async () => {
    const { invoke, payload, account, req } = harness(['one', 'two'], 'three')
    payload.find.mockResolvedValue({ docs: [{ id: 'three' }] })
    payload.update.mockImplementation(async ({ data }) => Object.assign(account, data))
    const change = { expectedUpdatedAt: revision, addIds: ['three', 'three'], removeIds: ['two'] }
    expect(await invoke('edit_my_site_shortcuts', { ...change, expectedUpdatedAt: oldRevision })).toMatch(/list changed/)
    expect(await invoke('edit_my_site_shortcuts', change)).toMatchObject({ siteIds: ['one', 'three'] })
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      req, overrideAccess: false, collection: 'users', id: 'editor',
      data: { tenants: [{ tenant: 'one', id: 'row-one' }, { tenant: 'three' }] },
    }))
    expect(await invoke('create_representative_drafts', { siteIds: ['three'], copy: draft })).toMatch(/assigned/)
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('existing post drafts', () => {
  const post = {
    id: 'post-one', title: 'Town update', slug: 'original-slug', tenant: { id: 'one' }, updatedAt: revision,
    _status: 'draft', meta: { title: 'SEO title', description: 'Old summary', image: 'social', descriptionApproved: true },
    content: { root: { children: [{ type: 'paragraph', children: [
      { type: 'text', text: 'The meeting starts at noon.', format: 1 },
      { type: 'link', fields: { url: '/events' }, children: [{ type: 'text', text: 'Event info' }] },
    ] }] } },
  }
  const update = {
    postId: post.id, expectedUpdatedAt: revision,
    changes: [
      { action: 'set_title', value: 'Updated town news' },
      { action: 'replace_text', from: 'at noon.', to: 'at 1 p.m.' },
      { action: 'set_search_description', value: 'New summary' },
    ],
  }

  it('reads and updates an existing draft on the selected site while preserving its slug, formatting and social image', async () => {
    const { invoke, payload, req } = harness(['two'])
    payload.findByID.mockImplementation(async ({ collection }) => collection === 'posts' ? post : { id: 'one' })
    payload.update.mockImplementation(async ({ data }) => ({ ...post, ...data }))
    expect(await invoke('find_post_drafts', { postId: post.id, query: '' })).toMatchObject({
      title: 'Town update', body: 'The meeting starts at noon.Event info', updatedAt: revision,
    })
    expect(await invoke('edit_post_draft', update)).toMatchObject({
      id: post.id, title: 'Updated town news', status: 'draft', startedRevision: false, editUrl: '/admin/collections/posts/post-one',
    })
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      req, collection: 'posts', id: post.id, draft: true, overrideAccess: false, overrideLock: false,
      data: { _status: 'draft', title: 'Updated town news', slug: post.slug,
        content: { root: { children: [{ type: 'paragraph', children: [
          { type: 'text', text: 'The meeting starts at 1 p.m.', format: 1 },
          post.content.root.children[0]!.children[1],
        ] }] } },
        meta: { ...post.meta, description: 'New summary', descriptionApproved: false },
      },
    }))
    expect(payload.db.commitTransaction).toHaveBeenCalledWith('transaction')
  })

  it.each([{ changes: update.changes }, { changes: [] }])('starts an unpublished revision on the original published post', async ({ changes }) => {
    const { invoke, payload, req } = harness()
    const published = { ...post, _status: 'published' }
    payload.findByID.mockImplementation(async ({ collection }) => collection === 'posts' ? published : { id: 'one' })
    payload.update.mockImplementation(async ({ data }) => ({ ...published, ...data }))

    expect(await invoke('find_post_drafts', { postId: post.id, query: '' })).toMatchObject({
      id: post.id, status: 'published', updatedAt: revision,
    })
    expect(await invoke('edit_post_draft', { ...update, changes })).toMatchObject({
      id: post.id, status: 'draft', startedRevision: true, previewUrl: '/api/admin/assistant/preview/post-one',
      editUrl: '/admin/collections/posts/post-one',
    })
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      req, collection: 'posts', id: post.id, draft: true, overrideAccess: false, overrideLock: false,
      data: expect.objectContaining({ _status: 'draft' }),
    }))
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('reuses an existing draft when asked to start a revision with no edits', async () => {
    const { invoke, payload } = harness()
    payload.findByID.mockImplementation(async ({ collection }) => collection === 'posts' ? post : { id: 'one' })
    expect(await invoke('edit_post_draft', { ...update, changes: [] })).toMatchObject({
      id: post.id, status: 'draft', startedRevision: false,
    })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it.each([
    { ...post, _status: undefined },
    { ...post, tenant: { id: 'two' } },
    { ...post, updatedAt: oldRevision },
    { ...post, _status: 'published', updatedAt: oldRevision },
  ])('rejects an unsupported status, foreign site, or stale revision before saving', async attempted => {
    const { invoke, payload } = harness()
    payload.findByID.mockImplementation(async ({ collection }) => collection === 'posts' ? attempted : { id: 'one' })
    expect(await invoke('edit_post_draft', update)).toMatch(/editable post|draft changed/)
    expect(payload.update).not.toHaveBeenCalled()
  })
})

it('lists published posts for a named active site by publication date without reading draft revisions', async () => {
  const { invoke, payload, req } = harness(['one'])
  payload.findByID.mockImplementation(async ({ id }) => ({ id, name: 'Ackert, Tim', slug: 'ackert' }))
  const published = { id: 'first', tenant: 'two', title: 'District update', slug: 'district-update',
    _status: 'published', publishedAt: revision }
  payload.find.mockResolvedValue({
    docs: [published, { ...published, id: 'hidden', _status: 'draft' }, { ...published, id: 'other', tenant: 'one' }],
  })
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.cthousegop.com')
  try {
    expect(await invoke('list_published_posts', { siteId: 'two', query: '', limit: 5 })).toMatchObject({
      site: { id: 'two', name: 'Ackert, Tim' },
      posts: [{ id: 'first', title: 'District update', publishedAt: revision, url: 'https://www.cthousegop.com/ackert/district-update' }],
    })
  } finally { vi.unstubAllEnvs() }
  expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({
    req, collection: 'posts', draft: false, overrideAccess: false,
    where: { and: [{ tenant: { equals: 'two' } }, { _status: { equals: 'published' } }] },
    sort: ['-publishedAt', '-createdAt', 'id'], limit: 5,
  }))
  expect(payload.update).not.toHaveBeenCalled()
})

describe('representative press releases', () => {
  it('creates a single draft on the selected site without a shortcut or a representative profile', async () => {
    const { invoke, payload, req } = harness(['two'])
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockImplementation(async ({ data }) => ({ id: 'post-one', ...data }))
    const copy = { ...draft, title: 'District update', paragraphs: ['The meeting starts at 1 p.m.'] }
    expect(await invoke('create_post_draft', { copy })).toMatchObject({ id: 'post-one', status: 'draft', siteId: 'one' })
    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({
      req, collection: 'posts', draft: true, overrideAccess: false,
      data: expect.objectContaining({ title: copy.title, tenant: 'one', _status: 'draft' }),
    }))
    expect(payload.find).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'rep-info' }))
  })

  it('reads the assigned active roster and exposes ambiguous representatives for editorial review', async () => {
    const { invoke, payload, req } = harness()
    const sites = [{ id: 'one', name: 'Site One', slug: 'one' }, { id: 'two', name: 'Site Two', slug: 'two' }]
    const profile = { tenant: { id: 'one' }, name: 'Jordan Lee', officeTitle: 'Representative', districtNumber: 1, towns: [{ town: 'Avon' }] }
    const two = { ...profile, tenant: { id: 'two' } }
    const docs: Record<string, unknown[]> = {
      tenants: sites, 'rep-info': [profile, two, two], categories: [{ id: 'news', title: 'News' }],
      'article-types': [{ id: 'release', title: 'Press release' }],
    }
    payload.find.mockImplementation(async ({ collection }) => ({ docs: docs[collection] }))
    expect(await invoke('read_release_options', {})).toEqual({
      representatives: [
        { siteId: 'one', site: 'Site One', slug: 'one', representative: { name: 'Jordan Lee', officeTitle: 'Representative', district: 1, towns: ['Avon'] } },
        { siteId: 'two', site: 'Site Two', slug: 'two', representative: null },
      ],
      categories: docs.categories, articleTypes: docs['article-types'],
    })
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({
      req, overrideAccess: false, collection: 'tenants',
      where: { and: [{ id: { in: ['one', 'two'] } }, { archived: { not_equals: true } }] },
    }))
  })

  it('creates personalized reviewable drafts with SEO and returns existing drafts on a retry', async () => {
    const { invoke, payload, req } = harness()
    const profiles = [
      { tenant: 'one', name: 'Jordan Lee', districtNumber: 1, officeTitle: 'Representative', towns: [{ town: 'Avon' }, { town: 'Canton' }] },
      { tenant: 'two', name: 'Alex Kim', districtNumber: 2, officeTitle: 'Representative', towns: [{ town: 'Rocky Hill' }] },
    ]
    const posts = new Map<string, { id: string; _status: string; title: string }>()
    payload.find.mockImplementation(async ({ collection, where }) => {
      if (collection === 'posts') {
        const saved = posts.get(where.and[1].dashboardDraftKey.equals)
        return { docs: saved ? [saved] : [] }
      }
      if (collection === 'rep-info') return { docs: profiles.filter(rep => rep.tenant === where.tenant.equals) }
      if (collection === 'standard-media') return { docs: [{ defaultFeaturedImage: 'social' }] }
      if (collection === 'media') return { docs: [{ id: 'social', tenant: 'one', mimeType: 'image/jpeg' }] }
      throw new Error('Unexpected collection ' + collection)
    })
    payload.create.mockImplementation(async ({ data }) => {
      const post = { id: 'post-' + data.tenant, _status: data._status, title: data.title, meta: data.meta }
      posts.set(data.dashboardDraftKey, post)
      return post
    })
    const args = { siteIds: ['one', 'two', 'one'], copy: draft }
    expect(await invoke('create_representative_drafts', args)).toMatchObject({ results: [
      { siteId: 'one', status: 'draft', created: true, imageMissing: false, editUrl: '/admin/collections/posts/post-one' },
      { siteId: 'two', status: 'draft', created: true, imageMissing: true, editUrl: '/admin/collections/posts/post-two' },
    ] })
    const [first, second] = payload.create.mock.calls.map(([call]) => call)
    expect(first).toMatchObject({
      req, overrideAccess: false, collection: 'posts', draft: true,
      context: { dashboardDraftKey: first.data.dashboardDraftKey },
      data: {
        tenant: 'one', _status: 'draft', title: 'Jordan Lee shares district news',
        meta: { title: 'Jordan Lee | District 1 news', description: 'An update for residents of Avon and Canton.', descriptionApproved: false, image: 'social' },
        keyTakeaways: [{ point: 'District 1' }, { point: 'Representative Jordan Lee' }, { point: 'Communities include Avon and Canton' }, { point: 'Read the release' }],
        keyTakeawaysApproved: false, categories: ['news'], articleType: 'release',
      },
    })
    expect(getPlainTextFromLexical(first.data.content)).toBe('Representative Jordan Lee represents District 1.\nThe district includes Avon and Canton.')
    expect(second.data.meta).toEqual({ title: 'Alex Kim | District 2 news', description: 'An update for residents of Rocky Hill.', descriptionApproved: false })
    expect(await invoke('create_representative_drafts', args)).toMatchObject({ results: [
      { id: 'post-one', created: false, imageMissing: false }, { id: 'post-two', created: false, imageMissing: true },
    ] })
    expect(payload.create).toHaveBeenCalledTimes(2)
  })

  it('rechecks assignments, rejects unassigned destinations even for a super user, and skips ambiguous profiles', async () => {
    const { invoke, payload, account } = harness(['one', 'two'], 'one', ['super'])
    payload.find.mockResolvedValue({ docs: [] })
    expect(await invoke('create_representative_drafts', { siteIds: ['outside'], copy: draft })).toMatch(/assigned/)
    account.tenants.pop()
    const result = await invoke('create_representative_drafts', { siteIds: ['one', 'two'], copy: draft })
    expect(result).toMatchObject({ results: [
      { siteId: 'one', error: expect.stringMatching(/single representative/) },
      { siteId: 'two', error: expect.stringMatching(/assigned sites/) },
    ] })
    expect(payload.create).not.toHaveBeenCalled()
  })
})
