import { describe, expect, it, vi } from 'vitest'
import { createLexicalValueFromText } from '@/lib/live-editor/lexical'
import { generatePostSeo, getPostSeoArticleText } from './generatePostSeo'

const create = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({ default: class { responses = { create } } }))

const origin = 'https://cms.example.test'
const regularBody = createLexicalValueFromText('Regular article body with details about the town meeting.')

describe('post SEO article text', () => {
  it('keeps the regular article body for posts without readable layout text', async () => {
    await expect(getPostSeoArticleText({ content: regularBody }, origin)).resolves.toContain('Regular article body')
    await expect(getPostSeoArticleText({ content: regularBody, layout: [{ blockType: 'emailSpacer', size: 24 }] }, origin))
      .resolves.toContain('Regular article body')
  })

  it('sends the visible shared layout to the model in reading order', async () => {
    const articleText = await getPostSeoArticleText({
      content: regularBody,
      layout: [
        { blockType: 'emailHeading', text: 'Town water project' },
        { blockType: 'emailGrid', layout: 'twoColumns',
          leftBlocks: [{ blockType: 'emailText', text: createLexicalValueFromText('The well project starts in January.') }],
          centerBlocks: [{ blockType: 'emailText', text: createLexicalValueFromText('Hidden column text.') }],
          rightBlocks: [{ blockType: 'emailMarkdown', markdown: '**Residents** can comment at the public hearing.' }],
        },
        { blockType: 'emailArticleImageRight', heading: 'Meeting details', body: 'The hearing is at town hall.' },
      ],
    }, origin)
    expect(articleText).toMatch(/Town water project[\s\S]*The well project starts in January\.[\s\S]*Residents can comment[\s\S]*The hearing is at town hall\./)
    expect(articleText).not.toMatch(/Hidden column text|Regular article body/)

    create.mockResolvedValueOnce({ output_text: JSON.stringify({
      articleType: 'news',
      categories: ['municipal'],
      description: 'The town will hold a hearing on its water project.',
      keyTakeaways: ['The well project starts in January', 'Residents can comment', 'The hearing is public', 'The hearing is at town hall'],
      metaTitle: 'Town water project hearing',
    }) })
    await generatePostSeo({
      apiKey: 'test-key',
      articleTypeOptions: [{ slug: 'news' }],
      categoryOptions: [{ slug: 'municipal' }],
      articleText,
      title: 'Town water project',
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining(`Article text:\n${articleText}`),
    }))
  })

  it('reads original post layout blocks and includes the body where placed', async () => {
    const articleText = await getPostSeoArticleText({
      content: regularBody,
      layout: [
        { blockType: 'postCallout', heading: 'Meeting notice', content: createLexicalValueFromText('The public meeting is on Monday.') },
        { blockType: 'postGrid', layout: 'twoColumns',
          leftBlocks: [{ blockType: 'postBody' }],
          rightBlocks: [{ blockType: 'postList', items: [{ title: 'Comment period', body: 'Written remarks are welcome.' }] }],
        },
      ],
    }, origin)
    expect(articleText).toMatch(/Meeting notice[\s\S]*meeting is on Monday[\s\S]*Regular article body[\s\S]*Comment period[\s\S]*Written remarks/)
  })
})
