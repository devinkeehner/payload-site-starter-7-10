import { describe, expect, it, vi } from 'vitest'
import { createLexicalValueFromText } from '@/lib/live-editor/lexical'
import { getEmailPuckBlockSchema, getSharedPostBuilderSchema } from '@/lib/puck/schema'
import { convertEmailToPost } from './convertEmailToPost'
import { populateSharedPostLayout, renderSharedPostLayout } from './sharedPostLayout'

describe('shared email and post layouts', () => {
  const layout = [
    { id: 'heading', blockType: 'emailHeading', text: 'District news' },
    {
      id: 'row', blockType: 'emailGrid', layout: 'twoColumns',
      leftBlocks: [{ id: 'body', blockType: 'emailText', text: createLexicalValueFromText('Budget update', { color: '#7a0012' }) }],
      rightBlocks: [{ id: 'image', blockType: 'emailImage', media: { id: 'media', url: '/media/meeting.jpg' }, alt: 'Meeting photo' }],
    },
    { id: 'footer', blockType: 'emailFooterOneColumn', address: '300 Capitol Ave.' },
  ]

  it('makes every email block available in posts with the same fields and slots', () => {
    const postSchemas = getSharedPostBuilderSchema()
    for (const schema of getEmailPuckBlockSchema()) {
      expect(postSchemas.find(post => post.slug === schema.slug)).toEqual(schema)
    }
    expect(postSchemas.some(block => block.slug === 'postBody')).toBe(true)
  })

  it('copies native records and uses text from the first visible body for the optional post content', () => {
    const post = convertEmailToPost(layout, 'Newsletter')
    expect(post.layout).toEqual(layout)
    expect(post.layout[1]).not.toBe(layout[1])
    expect(post.content).toEqual(createLexicalValueFromText('Budget update'))
    expect(convertEmailToPost(null, 'Fallback').layout).toEqual([])
  })

  it('renders mixed layouts in order with working media, mobile row hooks and safe Markdown', async () => {
    const runs = await renderSharedPostLayout([
      ...layout,
      { blockType: 'postBody' },
      { blockType: 'emailMarkdown', markdown: '<img src="https://example.test/image.jpg" onerror="alert(1)">\n\n<script>bad()</script>\n\n**Saved preview**' },
    ], 'https://example.test')
    expect(runs.map(({ start, count }) => ({ start, count }))).toEqual([{ start: 0, count: 3 }, { start: 4, count: 1 }])
    expect(runs[0]?.html).toContain('District news')
    expect(runs[0]?.html).toContain('Budget update')
    expect(runs[0]?.html).toContain('https://example.test/media/meeting.jpg')
    expect(runs[0]?.html).toContain('email-grid-column')
    expect(runs[0]?.html).toContain('#7a0012')
    expect(runs[0]?.html).toContain('300 Capitol Ave.')
    expect(runs[1]?.html).toContain('<strong')
    expect(runs[1]?.html).toContain('Saved preview')
    expect(runs[1]?.html).not.toMatch(/onerror|script|bad\(\)/)
  })

  it('uses the public Render origin for assets when Next sees the internal listener', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://website.example.test')
    vi.stubEnv('PAYLOAD_PUBLIC_SERVER_URL', '')
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://cms.example.test')
    try {
      const post = await populateSharedPostLayout({
        doc: { layout: [
          { blockType: 'emailVideo', title: 'District video', youtubeUrl: 'https://www.youtube.com/watch?v=E_TyM1zdqAg' },
          { blockType: 'emailFooterOneColumn', socialLinks: [{ platform: 'facebook', url: 'https://www.facebook.com/example' }] },
        ] },
        context: {},
        req: { payloadAPI: 'REST', origin: 'https://localhost:10000' },
      } as Parameters<typeof populateSharedPostLayout>[0])
      const html = post.sharedLayoutHTML[0].html
      expect(html).toContain('src="https://cms.example.test/api/email-video-thumbnail?src=')
      expect(html).toContain('src="https://cms.example.test/email-icons/facebook.png"')
      expect(html).toMatch(/<div style="margin:10px auto 26px; max-width:640px; width:100%;"/)
      expect(html).not.toContain('website.example.test')
      expect(html).not.toContain('localhost')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('exposes the article columns to the website mobile stacking rule', async () => {
    const [run] = await renderSharedPostLayout([{
      blockType: 'emailArticleImageRight',
      heading: 'District news',
      media: { id: 'banner', url: '/media/banner.jpg' },
    }], 'https://cms.example.test')
    expect(run?.html.match(/class="email-grid-column"/g)).toHaveLength(2)
  })
})
