import { expect, test, type Page } from '@playwright/test'
import { getPageBuilderSchema } from '../../src/lib/puck/schema'

type Node = { blockType: string; id?: string; text?: string; children?: Node[]; [key: string]: unknown }
type ToolResult = { isError?: boolean; structuredContent: { revision?: number; sectionId?: string; error?: string } }
type TestWindow = Window & { pageEditorTools: Record<string, { execute(input: unknown): Promise<ToolResult> }> }
const command = (page: Page, name: string, input: unknown = {}) =>
  page.evaluate(([name, input]) => (window as unknown as TestWindow).pageEditorTools[name]!.execute(input), [name, input] as const)

test('agent-built sections share the draft and can be reused alongside existing blocks', async ({ page }, testInfo) => {
  test.setTimeout(130_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const updatedAt = '2026-11-26T20:00:00Z'
  const legacy = { id: 'legacy-form', blockType: 'formBlock', form: 'existing-form' }
  const layouts = new Map<string, Node[]>([['annual-budget', [legacy]], ['budget-detail', []]])
  const templates: Array<{ id: string; name: string; section: Node }> = []
  const schemas = getPageBuilderSchema()

  await page.route('**/api/live-editor/pages/**', async route => {
    const request = route.request()
    const [, id, action] = new URL(request.url()).pathname.match(/\/pages\/([^/]+)(?:\/(.*))?$/) || []
    if (!id || !layouts.has(id)) return route.abort()
    if (action === 'sections' && request.method() === 'POST') {
      const body = request.postDataJSON()
      const template = { id: 'saved-section', ...body }
      templates.push(template)
      return route.fulfill({ status: 201, json: { template } })
    }
    if (action === 'sections') return route.fulfill({ json: { sections: templates } })
    if (action === 'options') return route.fulfill({ json: { options: [] } })
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON()
      expect(body.expectedUpdatedAt).toBe(updatedAt)
      layouts.set(id, body.page.layout)
    }
    return route.fulfill({ json: { page: { collection: 'pages', id, title: id, layout: layouts.get(id), updatedAt }, schemas } })
  })

  await page.addInitScript(() => {
    const tools: TestWindow['pageEditorTools'] = {}
    ;(window as unknown as TestWindow).pageEditorTools = tools
    Object.defineProperty(document, 'modelContext', { value: {
      registerTool(tool: TestWindow['pageEditorTools'][string] & { name: string }) { tools[tool.name] = tool },
      unregisterTool(name: string) { delete tools[name] },
    } })
  })

  await page.goto('/live-editor/pages/annual-budget')
  await expect(page).toHaveTitle('Live Editor')
  await expect(page.locator('[data-live-editor-site-tools]')).toHaveAttribute('data-live-editor-site-tools', 'ready', { timeout: 30_000 })
  const desktop = page.frameLocator('iframe[title="Desktop page canvas"]')
  await expect(desktop.locator('[data-live-editor-legacy-page-block="formBlock"]')).toBeVisible({ timeout: 30_000 })

  const snapshot = await command(page, 'live_editor_read_document')
  const proposal = {
    blockType: 'composableSection', title: 'Budget highlights', tone: 'muted',
    children: [
      { blockType: 'sectionHeading', text: 'Budget at a glance' },
      { blockType: 'sectionGrid', variant: 'three', children: [
        { blockType: 'sectionStatistic', value: '$12M', text: 'Roads' },
        { blockType: 'sectionStatistic', value: '$5M', text: 'Schools' },
        { blockType: 'sectionStatistic', value: '$2M', text: 'Parks' },
      ] },
    ],
  }
  const first = await command(page, 'live_editor_insert_section', { expectedRevision: snapshot.structuredContent.revision, section: proposal })
  expect(first.isError).toBeFalsy()
  const sectionId = first.structuredContent.sectionId!
  const section = desktop.getByTestId(`block-${sectionId}`)
  await expect(section.getByText('Budget at a glance')).toBeVisible()
  await expect(section.getByText('$12M')).toBeVisible()
  const stats = section.locator('[data-unsteady-block-type="sectionStatistic"]')
  await expect(stats).toHaveCount(3)
  await expect(section.locator('[data-variant="three"]')).toHaveCSS('grid-template-columns', /px .*px .*px/)
  expect(layouts.get('annual-budget')).toEqual([legacy])

  const undone = await command(page, 'live_editor_undo', { expectedRevision: first.structuredContent.revision })
  expect(undone.isError).toBeFalsy()
  await expect(section).toHaveCount(0)
  const redone = await command(page, 'live_editor_redo', { expectedRevision: undone.structuredContent.revision })
  expect(redone.isError).toBeFalsy()
  await expect(section.getByText('Budget at a glance')).toBeVisible()

  const roads = stats.filter({ hasText: '$12M' })
  const parks = stats.filter({ hasText: '$2M' })
  await roads.hover()
  const grip = await roads.getByRole('button', { name: 'Move Roads', exact: true }).boundingBox()
  const destination = await parks.boundingBox()
  if (!grip || !destination) throw new Error('Could not find the source and destination on the canvas.')
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(destination.x + destination.width * 0.8, destination.y + destination.height / 2, { steps: 14 })
  await page.mouse.up()
  await expect(stats.last()).toContainText('Roads')
  await page.screenshot({ path: testInfo.outputPath('page-sections-desktop.png') })

  const revised = await command(page, 'live_editor_read_document')
  const savedSection = await command(page, 'live_editor_save_section', { expectedRevision: revised.structuredContent.revision, sectionId, name: 'Annual budget stats' })
  expect(savedSection.isError).toBeFalsy()
  expect(templates).toHaveLength(1)
  await page.getByRole('button', { name: 'Mobile preview' }).click()
  const mobile = page.frameLocator('iframe[title="Mobile page canvas"]')
  await expect(mobile.getByText('$2M', { exact: true })).toBeVisible()
  await expect(mobile.locator('[data-variant="three"]')).toHaveCSS('grid-template-columns', /^\d+(?:\.\d+)?px$/)
  await page.screenshot({ path: testInfo.outputPath('page-sections-mobile.png') })
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect.poll(() => layouts.get('annual-budget')?.length).toBe(2)
  expect(layouts.get('annual-budget')?.[0]).toEqual(legacy)
  await page.reload()
  await expect(page.frameLocator('iframe[data-unsteady-viewport]').getByText('Budget at a glance')).toBeVisible()

  await page.goto('/live-editor/pages/budget-detail')
  await page.getByRole('button', { name: 'Annual budget stats', exact: true }).click()
  const reused = page.frameLocator('iframe[data-unsteady-viewport]').locator('[data-unsteady-block-type="composableSection"]')
  await expect(reused.getByText('Budget at a glance')).toBeVisible()
  expect(await reused.getAttribute('data-unsteady-block')).not.toBe(sectionId)
  expect(errors).toEqual([])
})
