import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { EMAIL_LAYOUT_BLOCKS } from '@/components/email/blocks/config'
import { loadEditorPost, saveEditorPost } from './postService'

const updatedAt = '2026-11-19T20:00:00.000Z'
function request(tenant = 'site-a') {
  const findByID = vi.fn(async ({ collection }: { collection: string }) => collection === 'posts'
    ? { id: 'post', tenant, title: 'Post', layout: [], updatedAt }
    : { id: 'image', tenant: 'site-a' })
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'post', tenant, updatedAt, ...data }))
  const req = {
    user: { roles: ['alphaTester'], tenants: [{ tenant: 'site-a' }] },
    payload: { findByID, update, config: { collections: [{ slug: 'posts', fields: [{ name: 'layout', type: 'blocks', blocks: EMAIL_LAYOUT_BLOCKS }] }] } },
  } as unknown as PayloadRequest
  return { req, update }
}

describe('post builder persistence', () => {
  it('stores native row structure with media IDs and preserves regular post content', async () => {
    const { req, update } = request()
    const leftBlocks = [{ blockType: 'emailImage', media: { id: 'image', url: '/image.jpg' } }]
    await saveEditorPost(req, 'post', { expectedUpdatedAt: updatedAt, post: {
      layout: [{ blockType: 'emailGrid', layout: 'oneColumn', leftBlocks }],
      content: 'outside the visual editor',
      _status: 'published',
    } })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'posts', draft: true, overrideAccess: false, overrideLock: false,
      data: { layout: [{ blockType: 'emailGrid', layout: 'oneColumn', leftBlocks: [{ blockType: 'emailImage', media: 'image' }] }] },
    }))
  })

  it('rejects another site’s draft and refuses a revision conflict', async () => {
    await expect(loadEditorPost(request('site-b').req, 'post')).rejects.toMatchObject({ status: 403 })
    const { req, update } = request()
    await expect(saveEditorPost(req, 'post', { expectedUpdatedAt: '2026-11-19T19:00:00.000Z', post: { layout: [] } }))
      .rejects.toMatchObject({ status: 409 })
    expect(update).not.toHaveBeenCalled()
  })
})
