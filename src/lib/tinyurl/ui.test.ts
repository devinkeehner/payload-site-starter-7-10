import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TinyURLField, TinyURLImportField } from '@/components/admin/TinyURLField'
const ui = vi.hoisted(() => ({
  setValue: vi.fn(),
  click: undefined as (() => Promise<void>) | undefined,
  change: undefined as ((event: { target: { value: string } }) => void) | undefined,
}))
vi.mock('@payloadcms/ui', () => ({
  useField: () => ({ value: 'hello', setValue: ui.setValue }),
  useDocumentInfo: () => ({ id: 'doc-1' }),
  FieldLabel: () => null,
  TextInput: (props: { onChange: typeof ui.change }) => {
    ui.change = props.onChange
    return null
  },
  Button: (props: { onClick: typeof ui.click }) => {
    ui.click = props.onClick
    return null
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
describe('editor controls', () => {
  it('passes input text, rather than a change-event object, into the alias field', () => {
    renderToStaticMarkup(
      React.createElement(TinyURLField, {
        field: { name: 'shortLinkAlias', label: 'TinyURL alias' },
        path: 'shortLinkAlias',
      } as never),
    )
    ui.change?.({ target: { value: 'new-alias' } })
    expect(ui.setValue).toHaveBeenCalledWith('new-alias')
  })
  it('explicitly creates/syncs an alias using the document endpoint without preview URLs', async () => {
    vi.stubGlobal('window', { location: { pathname: '/admin/collections/posts/doc-1' } })
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ alias: 'hello', shortURL: 'https://rep.example/hello' })),
      )
    vi.stubGlobal('fetch', fetcher)
    renderToStaticMarkup(
      React.createElement(TinyURLField, {
        field: { name: 'shortLinkAlias', label: 'TinyURL alias' },
        path: 'shortLinkAlias',
      } as never),
    )
    await ui.click?.()
    expect(fetcher).toHaveBeenCalledWith(
      '/api/posts/doc-1/short-link',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ alias: 'hello' }),
        credentials: 'include',
      }),
    )
  })
  it('imports from the saved Site Profile without any remote mutation payload', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ imported: 10, domain: 'rep.example' })))
    vi.stubGlobal('fetch', fetcher)
    renderToStaticMarkup(React.createElement(TinyURLImportField))
    await ui.click?.()
    expect(fetcher).toHaveBeenCalledWith('/api/rep-info/doc-1/import-short-links', {
      method: 'POST',
      credentials: 'include',
    })
  })
})
