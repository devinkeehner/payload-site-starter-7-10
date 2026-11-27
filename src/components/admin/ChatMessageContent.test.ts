import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ChatMessageContent } from './ChatMessageContent'

const render = (content: string, props: { plain?: boolean; adminRoute?: string } = {}) =>
  renderToStaticMarkup(createElement(ChatMessageContent, { content, ...props }))

it('formats assistant replies, keeps code literal, and leaves unfinished markup readable', () => {
  expect(render('Updated **About**. Use `**bold**` and **check `foo`**.\nStill **typing')).toBe(
    '<p>Updated <strong>About</strong>. Use <code>**bold**</code> and <strong>check <code>foo</code></strong>.\nStill **typing</p>',
  )
})

it('links only to records under the configured admin route and only when links are enabled', () => {
  const allowed = '**[Review draft](/cms/collections/posts/123)**'
  expect(render(allowed, { adminRoute: '/cms' })).toContain('<strong><a href="/cms/collections/posts/123">Review draft</a></strong>')
  expect(render(allowed)).not.toContain('<a ')
  for (const destination of ['https://other.test', '//other.test', '/cms-other/posts', '/cms/../posts', '/cms/%2e%2e/posts', '/cms/\\other.test']) {
    expect(render(`[Review](${destination})`, { adminRoute: '/cms' })).not.toContain('<a ')
  }
  expect(render('`[Review](/cms/example)`', { adminRoute: '/cms' })).toBe('<p><code>[Review](/cms/example)</code></p>')
})

it('renders pasted user messages literally and escapes markup in both roles', () => {
  const message = '**About** `name` [Review](/cms/example) <b>text</b>'
  expect(render(message, { adminRoute: '/cms', plain: true })).toBe('<p>**About** `name` [Review](/cms/example) &lt;b&gt;text&lt;/b&gt;</p>')
  expect(render('**<b>text</b>**')).toBe('<p><strong>&lt;b&gt;text&lt;/b&gt;</strong></p>')
})
