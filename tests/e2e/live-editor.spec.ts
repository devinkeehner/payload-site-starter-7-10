import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { getEmailPuckBlockSchema } from '../../src/lib/puck/schema'

// Disconnected fixtures deliberately exercise Gov's real, native email schema.
// Every API request is intercepted, including requests made by preview popups.
const emailId = 'live-editor-qa'
const apiPath = `/api/live-editor/emails/${emailId}`
const schemas = getEmailPuckBlockSchema()
const lexical = (text: string) => ({
  root: {
    type: 'root', version: 1, direction: null, format: '', indent: 0,
    children: [{
      type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
      children: [{ type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text }],
    }],
  },
})

type NativeBlock = {
  id: string
  blockType: string
  text?: unknown
  leftBlocks?: NativeBlock[]
  rightBlocks?: NativeBlock[]
  [key: string]: unknown
}
type Draft = {
  id: string
  title: string
  subject: string
  preheader: string
  replyTo: string
  status: string
  updatedAt: string
  layout: NativeBlock[]
}

function fixture(): Draft {
  return {
    id: emailId,
    title: 'Disconnected QA email',
    subject: 'A local email subject',
    preheader: 'A local email preheader',
    replyTo: 'qa@example.test',
    status: 'draft',
    updatedAt: '2026-11-06T12:00:00.000Z',
    layout: [
      { id: 'heading', blockType: 'emailHeading', text: 'Original heading', level: 'h1', align: 'left', color: 'foreground' },
      { id: 'body', blockType: 'emailText', text: lexical('Original body copy'), align: 'left', color: 'foreground' },
      {
        id: 'grid', blockType: 'emailGrid', layout: 'twoColumns',
        leftBlocks: [{ id: 'nested', blockType: 'emailHeading', text: 'Nested heading', level: 'h2', align: 'left', color: 'foreground' }],
        centerBlocks: [], rightBlocks: [], fourthBlocks: [],
      },
    ],
  }
}

type ToolResult<T = Record<string, unknown>> = { structuredContent: T; isError?: boolean }
type BrowserTool = {
  name: string
  annotations: { readOnlyHint: boolean; consequentialHint: boolean }
  execute: (input: unknown) => Promise<ToolResult>
}
type ToolWindow = Window & { __liveEditorTestTools: Record<string, BrowserTool> }
type Slot = { id: string; address: { ownerId: string; path: string }; allowedSlugs?: string[] }
type Snapshot = { revision: number; slots: Slot[] }

async function mockEditor(context: BrowserContext, page: Page, initialEmail = fixture()) {
  let stored = initialEmail
  let conflicts = false
  let reads = 0
  const writes: Array<{ email: Record<string, unknown>; expectedUpdatedAt: string }> = []
  const unexpected: string[] = []
  const previews: string[] = []

  await context.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === apiPath && request.method() === 'GET') {
      reads += 1
      return route.fulfill({ json: { email: stored, schemas } })
    }
    if (url.pathname === apiPath && request.method() === 'PATCH') {
      const body = request.postDataJSON() as (typeof writes)[number]
      writes.push(body)
      if (conflicts) return route.fulfill({ status: 409, json: { error: 'This email draft changed after you opened it. Reload the latest draft before saving again.' } })
      if (body.expectedUpdatedAt !== stored.updatedAt) return route.fulfill({ status: 409, json: { error: 'Unexpected draft revision.' } })
      stored = {
        ...stored, ...body.email,
        updatedAt: new Date(Date.parse(stored.updatedAt) + 1000).toISOString(),
      } as Draft
      return route.fulfill({ json: { email: stored } })
    }
    if (url.pathname === `/api/emails/${emailId}/preview`) {
      previews.push(request.method())
      return route.fulfill({ json: {
        html: '<!doctype html><html><head><title>Gov email preview</title></head><body><main><h1>Gov rendered email preview</h1><p>Disconnected preview fixture</p></main></body></html>',
        text: 'Gov rendered email preview\nDisconnected preview fixture',
      } })
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  // Install the proposed browser API before React mounts. The application gets
  // no test-only execution hook; tests call only the tools it registers here.
  await page.addInitScript(() => {
    const tools: Record<string, BrowserTool> = {}
    ;(window as unknown as ToolWindow).__liveEditorTestTools = tools
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: BrowserTool, options?: { signal?: AbortSignal }) {
          tools[tool.name] = tool
          options?.signal?.addEventListener('abort', () => {
            if (tools[tool.name] === tool) delete tools[tool.name]
          }, { once: true })
        },
        unregisterTool(name: string) { delete tools[name] },
      },
    })
  })
  return {
    writes, unexpected, previews,
    get reads() { return reads },
    get stored() { return stored },
    conflict() { conflicts = true },
  }
}

async function openEditor(page: Page) {
  await page.goto(`/live-editor/emails/${emailId}`)
  await expect(page.locator('[data-unsteady-document]')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.locator('[data-live-editor-site-tools="ready"]')).toHaveCount(1)
  await expect(canvas(page).getByTestId('block-heading')).toBeVisible({ timeout: 30_000 })
}

function canvas(page: Page) {
  return page.frameLocator('iframe[data-unsteady-viewport]')
}

async function draft(page: Page): Promise<Draft> {
  return JSON.parse(await page.locator('[data-unsteady-document]').textContent() || '{}') as Draft
}

async function tool<T = Record<string, unknown>>(page: Page, name: string, input: unknown = {}): Promise<ToolResult<T>> {
  return page.evaluate(async ({ name, input }) => {
    const registered = (window as unknown as ToolWindow).__liveEditorTestTools[name]
    if (!registered) throw new Error(`Tool was not registered: ${name}`)
    return registered.execute(input)
  }, { name, input }) as Promise<ToolResult<T>>
}

async function snapshot(page: Page) {
  const result = await tool<Snapshot>(page, 'live_editor_read_document')
  expect(result.isError).not.toBe(true)
  return result.structuredContent
}

async function editHeading(page: Page, value: string) {
  await canvas(page).getByTestId('block-heading').focus()
  await canvas(page).getByTestId('block-heading').press('Enter')
  await page.getByRole('textbox', { name: /^text(?:\s*\*)?$/i }).fill(value)
  await expect.poll(async () => (await draft(page)).layout[0]?.text).toBe(value)
}

test.describe('standalone native email Live Editor (mock APIs)', () => {
  test.setTimeout(90_000)

  test('opens without Payload chrome and exposes the email-only catalog and fields', async ({ context, page }) => {
    const api = await mockEditor(context, page)
    const runtimeErrors: string[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    await openEditor(page)

    await expect(page).toHaveURL(new RegExp(`/live-editor/emails/${emailId}$`))
    await expect(page).toHaveTitle(/email|live editor/i)
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to Payload' })).toHaveAttribute('href', `/admin/collections/emails/${emailId}`)
    await expect(page.getByRole('navigation', { name: 'Campaign workflow' })).toHaveCount(0)
    await expect(page.locator('.nav-toggler, .payload__admin, [data-payload-admin]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /send|publish/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /legacy|sections|elements/i })).toHaveCount(0)
    for (const schema of schemas) {
      await page.getByRole('textbox', { name: 'Search blocks' }).fill(schema.slug)
      await expect(page.getByRole('button', { name: `Add ${schema.label}`, exact: true })).toBeVisible()
    }
    await page.getByRole('textbox', { name: 'Search blocks' }).fill('columnsBlock')
    await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
    await editHeading(page, 'Inspector heading')
    for (const name of ['id', '_id', 'blockType', 'blockName', 'puckRichText', 'Page slug', 'Hero']) {
      await expect(page.getByLabel(name, { exact: true })).toHaveCount(0)
    }
    await expect(page.locator('[data-nextjs-dialog-header], [data-nextjs-error-message]')).toHaveCount(0)
    expect(runtimeErrors).toEqual([])
    expect(consoleErrors).toEqual([])
    expect(api.unexpected).toEqual([])
    await page.screenshot({ path: '/tmp/live-editor-desktop.png' })
  })

  test('edits native heading and rich text through shared undo and redo', async ({ context, page }) => {
    const api = await mockEditor(context, page)
    await openEditor(page)
    await editHeading(page, 'Edited heading')
    await expect(canvas(page).getByRole('heading', { name: 'Edited heading', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(canvas(page).getByRole('heading', { name: 'Original heading', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(canvas(page).getByRole('heading', { name: 'Edited heading', exact: true })).toBeVisible()

    await canvas(page).getByTestId('block-body').focus()
    await canvas(page).getByTestId('block-body').press('Enter')
    await page.getByRole('textbox', { name: /^text(?:\s*\*)?$/i }).fill('Edited body copy')
    await page.getByRole('textbox', { name: /^text(?:\s*\*)?$/i }).press('Tab')
    await expect(canvas(page).getByTestId('block-body')).toContainText('Edited body copy')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(canvas(page).getByTestId('block-body')).toContainText('Original body copy')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(canvas(page).getByTestId('block-body')).toContainText('Edited body copy')
    expect((await draft(page)).layout[1]?.text).toHaveProperty('root')
    expect(api.writes).toHaveLength(0)
    expect(api.unexpected).toEqual([])
  })

  test('adds blocks to native emailGrid slots without website wrappers', async ({ context, page }) => {
    const api = await mockEditor(context, page)
    await openEditor(page)
    const right = (await snapshot(page)).slots.find(slot => slot.address.ownerId === 'grid' && slot.address.path === 'rightBlocks')
    expect(right).toBeDefined()
    await page.getByRole('combobox', { name: 'New block destination' }).selectOption(right!.id)
    await page.getByRole('textbox', { name: 'Search blocks' }).fill('emailHeading')
    await page.getByRole('button', { name: 'Add Email Heading', exact: true }).click()
    await expect.poll(async () => (await draft(page)).layout[2]?.rightBlocks?.length).toBe(1)
    const grid = (await draft(page)).layout[2]!
    const inserted = grid.rightBlocks![0]!
    expect(inserted.blockType).toBe('emailHeading')
    expect(inserted.id).toBeTruthy()
    expect(inserted.id).not.toBe('nested')
    expect(grid).not.toHaveProperty('columns')
    expect(grid).not.toHaveProperty('puckRichText')
    await expect(canvas(page).getByTestId(`block-${inserted.id}`)).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(async () => (await draft(page)).layout[2]?.rightBlocks?.length).toBe(0)
    expect(api.writes).toHaveLength(0)
    expect(api.unexpected).toEqual([])
  })

  test('saves native content with revision tokens and reopens the stored draft', async ({ context, page }) => {
    const api = await mockEditor(context, page)
    await openEditor(page)
    await editHeading(page, 'Persisted heading')
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect.poll(() => api.writes.length).toBe(1)
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0)
    expect(Object.keys(api.writes[0]!).sort()).toEqual(['email', 'expectedUpdatedAt'])
    expect(api.writes[0]!.expectedUpdatedAt).toBe(fixture().updatedAt)
    expect(Object.keys(api.writes[0]!.email).sort()).toEqual(['layout', 'preheader', 'replyTo', 'subject', 'title'])
    await editHeading(page, 'Second saved heading')
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect.poll(() => api.writes.length).toBe(2)
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0)
    expect(api.writes[1]!.expectedUpdatedAt).toBe('2026-11-06T12:00:01.000Z')
    await page.reload()
    await expect(canvas(page).getByRole('heading', { name: 'Second saved heading', exact: true })).toBeVisible()
    expect(api.stored.status).toBe('draft')
    expect(api.unexpected).toEqual([])
  })

  test('preserves unsaved content and undo history after a save conflict', async ({ context, page }) => {
    const api = await mockEditor(context, page)
    await openEditor(page)
    await editHeading(page, 'Keep this local edit')
    const before = await draft(page)
    const reads = api.reads
    api.conflict()
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: /changed after you opened|reload.*latest/i })).toBeVisible()
    expect(await draft(page)).toEqual(before)
    expect(api.reads).toBe(reads)
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(canvas(page).getByRole('heading', { name: 'Original heading', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(canvas(page).getByRole('heading', { name: 'Keep this local edit', exact: true })).toBeVisible()
    expect(api.unexpected).toEqual([])
  })

  test('opens Gov rendered preview without exposing delivery actions', async ({ context, page }) => {
    const api = await mockEditor(context, page)
    await openEditor(page)
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('link', { name: /preview.*new tab/i }).click()
    const popup = await popupPromise
    await expect(popup.frameLocator('iframe[title="Rendered email HTML"]').getByRole('heading', { name: 'Gov rendered email preview' })).toBeVisible()
    expect(new URL(popup.url()).pathname).toBe(`/live-editor/emails/${emailId}/preview`)
    await popup.getByRole('button', { name: 'Show plain text' }).click()
    await expect(popup.locator('pre')).toContainText('Disconnected preview fixture')
    expect(api.previews.length).toBeGreaterThan(0)
    expect(api.previews.every(method => method === 'GET')).toBe(true)
    expect(api.writes).toHaveLength(1)
    expect(api.unexpected).toEqual([])
    await popup.close()
  })

  test('keeps the editor contained and usable at a mobile viewport', async ({ context, page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const api = await mockEditor(context, page)
    await openEditor(page)
    await page.getByRole('button', { name: 'Mobile preview', exact: true }).click()
    await expect(page.locator('iframe[data-unsteady-viewport="mobile"]')).toBeVisible()
    await page.getByRole('button', { name: /hide left panel|close left panel/i }).first().click()
    await expect(canvas(page).getByTestId('block-heading')).toBeVisible()
    expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390)
    const bounds = await page.locator('iframe[data-unsteady-viewport]').boundingBox()
    expect(bounds!.width).toBeLessThanOrEqual(390)
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible()
    await page.screenshot({ path: '/tmp/live-editor-mobile.png' })
    expect(api.unexpected).toEqual([])
  })

  test('registers every WebMCP tool and shares revision guards and history with the UI', async ({ context, page }) => {
    const api = await mockEditor(context, page)
    await openEditor(page)
    const names = await page.evaluate(() => Object.keys((window as unknown as ToolWindow).__liveEditorTestTools).sort())
    expect(names).toEqual([
      'live_editor_edit_draft', 'live_editor_read_catalog', 'live_editor_read_document',
      'live_editor_read_preview', 'live_editor_redo', 'live_editor_scroll_preview', 'live_editor_undo',
    ])
    const catalog = await tool(page, 'live_editor_read_catalog')
    expect(catalog.isError).not.toBe(true)
    expect(JSON.stringify(catalog.structuredContent)).toContain('emailHeading')
    expect(JSON.stringify(catalog.structuredContent)).not.toContain('columnsBlock')
    expect((await tool(page, 'live_editor_read_catalog', { blockType: 'emailHeading' })).isError).not.toBe(true)
    const first = await snapshot(page)
    const changed = await tool<{ revision: number }>(page, 'live_editor_edit_draft', {
      expectedRevision: first.revision,
      command: { type: 'set_field', blockId: 'heading', path: ['text'], value: 'Agent heading' },
    })
    expect(changed.isError).not.toBe(true)
    await expect(canvas(page).getByRole('heading', { name: 'Agent heading', exact: true })).toBeVisible()
    const beforeStale = await draft(page)
    expect((await tool(page, 'live_editor_edit_draft', {
      expectedRevision: first.revision,
      command: { type: 'set_field', blockId: 'heading', path: ['text'], value: 'Stale overwrite' },
    })).isError).toBe(true)
    expect(await draft(page)).toEqual(beforeStale)
    expect((await tool(page, 'live_editor_undo', { expectedRevision: first.revision })).isError).toBe(true)

    expect((await tool(page, 'live_editor_undo', { expectedRevision: (await snapshot(page)).revision })).isError).not.toBe(true)
    await expect(canvas(page).getByRole('heading', { name: 'Original heading', exact: true })).toBeVisible()
    expect((await tool(page, 'live_editor_redo', { expectedRevision: (await snapshot(page)).revision })).isError).not.toBe(true)
    await expect(canvas(page).getByRole('heading', { name: 'Agent heading', exact: true })).toBeVisible()
    expect((await tool(page, 'live_editor_read_preview')).isError).not.toBe(true)
    expect((await tool(page, 'live_editor_scroll_preview', { blockId: 'nested' })).isError).not.toBe(true)
    expect((await tool(page, 'live_editor_scroll_preview', { direction: 'top' })).isError).not.toBe(true)
    expect((await tool(page, 'live_editor_scroll_preview', { direction: 'top', blockId: 'heading' })).isError).toBe(true)

    for (const command of [
      { type: 'set_field', blockId: 'heading', path: ['id'], value: 'changed-id' },
      { type: 'set_field', blockId: 'heading', path: ['puckRichText'], value: {} },
      { type: 'set_field', blockId: 'heading', path: ['level'], value: 'h6' },
      { type: 'set_field', blockId: 'body', path: ['text'], value: lexical('Bypass') },
      { type: 'set_field', blockId: 'grid', path: ['leftBlocks'], value: [] },
    ]) {
      expect((await tool(page, 'live_editor_edit_draft', { expectedRevision: (await snapshot(page)).revision, command })).isError).toBe(true)
    }
    expect(await draft(page)).toEqual(beforeStale)
    expect((await tool(page, 'live_editor_edit_draft', {
      expectedRevision: (await snapshot(page)).revision,
      command: { type: 'edit_text', blockId: 'body', path: ['text'], action: { type: 'replace-rich', value: 'Agent body copy' } },
    })).isError).not.toBe(true)
    await expect(canvas(page).getByTestId('block-body')).toContainText('Agent body copy')
    expect(api.writes).toHaveLength(0)
    expect(api.previews).toHaveLength(0)
    expect(api.unexpected).toEqual([])
  })

  test('completing a delayed image upload preserves newer edits in that block', async ({ context, page }) => {
    const email = fixture()
    email.layout.push({ id: 'image', blockType: 'emailImage', media: null, alt: 'Original alt', caption: 'Image caption', align: 'center' })
    const api = await mockEditor(context, page, email)
    let releaseUpload!: () => void
    const uploadResponse = new Promise<void>(resolve => { releaseUpload = resolve })
    let uploadStarted = false
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
    await context.route(`**/api/live-editor/emails/${emailId}/media`, async route => {
      expect(route.request().method()).toBe('POST')
      uploadStarted = true
      await uploadResponse
      await route.fulfill({ json: { doc: {
        id: 'uploaded-image', filename: 'qa.png', mimeType: 'image/png', alt: 'Uploaded image',
        url: `data:image/png;base64,${pixel}`,
      } } })
    })
    await openEditor(page)
    await canvas(page).getByTestId('block-image').focus()
    await canvas(page).getByTestId('block-image').press('Enter')
    await page.locator('input[type="file"]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: Buffer.from(pixel, 'base64') })
    await expect.poll(() => uploadStarted).toBe(true)
    await page.getByRole('textbox', { name: /^alt$/i }).fill('Newer descriptive alt')
    releaseUpload()
    await expect.poll(async () => ((await draft(page)).layout[3]?.media as Record<string, unknown> | null)?.id).toBe('uploaded-image')
    expect((await draft(page)).layout[3]?.alt).toBe('Newer descriptive alt')
    expect(api.writes).toHaveLength(0)
    expect(api.unexpected).toEqual([])
  })
})
