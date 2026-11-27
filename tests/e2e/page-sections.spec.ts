import { expect, test, type Page } from '@playwright/test'
import { getPageBuilderSchema } from '../../src/lib/puck/schema'

type Node = { blockType: string; id?: string; text?: string; children?: Node[]; [key: string]: unknown }
type ToolResult = { isError?: boolean; structuredContent: { revision?: number; sectionId?: string; error?: string; items?: Array<{ id: string }> } }
type TestWindow = Window & { pageEditorTools: Record<string, { execute(input: unknown): Promise<ToolResult> }> }
const command = (page: Page, name: string, input: unknown = {}) =>
  page.evaluate(([name, input]) => (window as unknown as TestWindow).pageEditorTools[name]!.execute(input), [name, input] as const)

async function mockPageEditor(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const updatedAt = '2026-11-26T20:00:00Z'
  const legacy = { id: 'legacy-form', blockType: 'formBlock', form: 'existing-form' }
  const layouts = new Map<string, Node[]>([['annual-budget', [legacy]], ['budget-detail', []]])
  const templates: Array<{ id: string; name: string; section: Node }> = []
  const schemas = getPageBuilderSchema()
  const photo = { id: 'capitol', alt: 'Capitol photo', filename: 'Capitol photo.jpg', mimeType: 'image/jpeg',
    url: '/media/Capitol photo.jpg' }
  await page.route('**/media/Capitol%20photo.jpg', route => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#183752"/></svg>',
  }))
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: 'YouTube player' }))

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
    if (action === 'options') {
      const { searchParams } = new URL(request.url())
      const options = searchParams.get('collection') === 'media' &&
        (searchParams.get('kind') === 'image' || searchParams.get('ids') === photo.id)
        ? [{ label: photo.alt, value: photo.id, resource: photo }] : []
      return route.fulfill({ json: { options } })
    }
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

  return { errors, layouts, legacy, templates, photo }
}

test('agent-built sections share the draft and can be reused alongside existing blocks', async ({ page }, testInfo) => {
  test.setTimeout(130_000)
  const { errors, layouts, legacy, templates } = await mockPageEditor(page)
  await page.goto('/live-editor/pages/annual-budget', { waitUntil: 'domcontentloaded' })
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
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.frameLocator('iframe[data-unsteady-viewport]').getByText('Budget at a glance')).toBeVisible({ timeout: 30_000 })

  await page.goto('/live-editor/pages/budget-detail', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Annual budget stats', exact: true }).click()
  const reused = page.frameLocator('iframe[data-unsteady-viewport]').locator('[data-unsteady-block-type="composableSection"]')
  await expect(reused.getByText('Budget at a glance')).toBeVisible()
  expect(await reused.getAttribute('data-unsteady-block')).not.toBe(sectionId)
  expect(errors).toEqual([])
})

test('Design Mode creates editable fields and reconnects media after saving', async ({ page }) => {
  test.setTimeout(100_000)
  const { errors, layouts, photo } = await mockPageEditor(page)
  await page.goto('/live-editor/pages/budget-detail', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-live-editor-site-tools]')).toHaveAttribute('data-live-editor-site-tools', 'ready', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Design', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Design a section' })).toBeVisible()
  const library = await command(page, 'live_editor_find_media', { kind: 'image', query: 'Capitol' })
  expect(library.structuredContent.items).toEqual([expect.objectContaining({ id: 'capitol' })])
  const latest = await command(page, 'live_editor_read_document')
  const designed = await command(page, 'live_editor_design_section', {
    expectedRevision: latest.structuredContent.revision,
    section: {
      title: 'Capitol feature',
      layout: { tag: 'header', style: { display: 'grid', gridTemplateColumns: '2fr 1fr', backgroundColor: '#eff3f8' }, children: [
        { field: 'Headline', style: { fontSize: '48px' } }, { field: 'Capitol photo' }, { field: 'Tour video' },
      ] },
      fields: [
        { name: 'Headline', element: { blockType: 'sectionHeading', text: 'Inside the Capitol' } },
        { name: 'Capitol photo', element: { blockType: 'sectionImage', image: photo.id } },
        { name: 'Tour video', element: { blockType: 'sectionVideo', youtubeUrl: 'https://youtu.be/2Ex83c49EJ8', caption: 'Capitol tour' } },
      ],
    },
  })
  expect(designed.isError).toBeFalsy()
  const featureId = designed.structuredContent.sectionId!
  const feature = page.frameLocator('iframe[data-unsteady-viewport]').getByTestId(`block-${featureId}`)
  await expect(feature.getByRole('heading')).toHaveCSS('font-size', '48px')
  const loadedPhoto = feature.getByRole('img', { name: 'Capitol photo' })
  await expect(loadedPhoto).toBeVisible()
  await expect.poll(() => loadedPhoto.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await expect(feature.locator('iframe[title="Capitol tour"]')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/2Ex83c49EJ8')
  await feature.getByRole('button', { name: 'Edit Heading', exact: true }).click()
  const headingInput = feature.getByRole('textbox')
  await headingInput.fill('A closer look at the Capitol')
  await headingInput.press('Tab')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect.poll(() => layouts.get('budget-detail')?.[0]?.children?.[0]?.text).toBe('A closer look at the Capitol')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.frameLocator('iframe[data-unsteady-viewport]').getByText('A closer look at the Capitol')).toBeVisible({ timeout: 30_000 })
  expect(errors).toEqual([])
})

test('designed card and field reorders share undo and persist without changing field bindings', async ({ page }, testInfo) => {
  test.setTimeout(100_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const { errors } = await mockPageEditor(page)
  await page.goto('/live-editor/pages/budget-detail', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-live-editor-site-tools]')).toHaveAttribute('data-live-editor-site-tools', 'ready', { timeout: 30_000 })
  const names = ['Mail-in voting', 'Election Day', 'Early voting']
  const fields = names.flatMap((name, index) => [
    { name: `${name} icon`, element: { blockType: 'sectionIcon', symbol: 'check', size: '32', color: '#FF4650' } },
    { name: `${name} heading`, element: { blockType: 'sectionHeading', text: name } },
    { name: `${name} link`, element: { blockType: 'sectionLink', text: `Resource ${index + 1}`, url: `/vote-${index + 1}` } },
  ])
  const draft = await command(page, 'live_editor_read_document')
  const result = await command(page, 'live_editor_design_section', {
    expectedRevision: draft.structuredContent.revision,
    section: { title: 'Voting options', fields, layout: {
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' },
      children: names.map(name => ({ style: { padding: '28px', backgroundColor: '#eff3f8' }, children: fields
        .filter(field => field.name.startsWith(`${name} `)).map(field => ({ field: field.name })) })),
    } },
  })
  expect(result.isError).toBeFalsy()
  const sectionId = result.structuredContent.sectionId!
  const iframe = page.locator('iframe[data-unsteady-viewport]')
  const canvas = page.frameLocator('iframe[data-unsteady-viewport]')
  const section = canvas.getByTestId(`block-${sectionId}`)
  const heads = section.getByRole('heading')
  await expect(heads).toHaveText(names, { timeout: 30_000 })
  expect((await iframe.boundingBox())!.width).toBeGreaterThan(1000)
  const finish = section.locator('[data-design-group="Early voting"]')
  const start = section.locator('[data-design-group="Mail-in voting"]')
  await finish.hover()
  const source = await finish.getByRole('button', { name: 'Move group: Early voting' }).boundingBox()
  const target = await start.boundingBox()
  if (!source || !target) throw new Error('Missing design drag handles.')
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 4, target.y + target.height / 2, { steps: 12 })
  await expect(start).toHaveAttribute('data-design-drop', 'before')
  await page.mouse.up()
  await expect(heads).toHaveText(['Early voting', 'Mail-in voting', 'Election Day'])

  const link = finish.getByTestId(/block-/).filter({ hasText: 'Resource 3' }).last()
  await link.hover()
  const linkGrip = await finish.getByRole('button', { name: 'Move Early voting link', exact: true }).boundingBox()
  const headingBox = await finish.getByRole('heading').boundingBox()
  if (!linkGrip || !headingBox) throw new Error('Missing designed field drag handles.')
  await page.mouse.move(linkGrip.x + linkGrip.width / 2, linkGrip.y + linkGrip.height / 2)
  await page.mouse.down()
  await page.mouse.move(headingBox.x + headingBox.width / 3, headingBox.y + headingBox.height / 4, { steps: 10 })
  await page.mouse.up()
  await expect(finish.locator('[data-designed-field]')).toHaveText([/./, /Resource 3/, /Early voting/])
  await finish.getByRole('button', { name: 'Move Early voting link', exact: true }).press('ArrowDown')
  await expect(finish.locator('[data-designed-field]').last()).toContainText('Resource 3')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(finish.locator('[data-designed-field]').nth(1)).toContainText('Resource 3')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(finish.locator('[data-designed-field]').last()).toContainText('Resource 3')
  const latest = await command(page, 'live_editor_read_document')
  const updated = await command(page, 'live_editor_edit_draft', { expectedRevision: latest.structuredContent.revision,
    command: { type: 'reorder_design', blockId: sectionId, parentPath: [], from: 2, to: 1 } })
  expect(updated.isError).toBeFalsy()
  await expect(heads).toHaveText(['Early voting', 'Election Day', 'Mail-in voting'])

  const icon = finish.locator('[data-unsteady-block-type="sectionIcon"]')
  await icon.getByRole('button', { name: 'Edit Early voting icon' }).focus()
  await icon.getByRole('button', { name: 'Edit Early voting icon' }).click()
  await page.locator('details').filter({ has: page.getByPlaceholder('Search icons') }).locator('summary').click()
  await page.getByPlaceholder('Search icons').fill('calendar')
  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  await expect(icon.locator('svg.lucide-calendar-days')).toHaveAttribute('width', '32')
  await expect(icon.locator('svg.lucide-calendar-days')).toHaveAttribute('stroke', '#FF4650')
  await page.screenshot({ path: testInfo.outputPath('design-reorder-desktop.jpg') })
  await page.getByRole('button', { name: 'Mobile preview' }).click()
  expect((await iframe.boundingBox())!.width).toBe(390)
  await expect(heads).toHaveText(['Early voting', 'Election Day', 'Mail-in voting'])
  const mobileBoxes = await section.locator('[data-design-group]').evaluateAll(cards => cards.map(card => {
    const { x, y } = card.getBoundingClientRect()
    return { x, y }
  }))
  expect(new Set(mobileBoxes.map(card => card.x)).size).toBe(1)
  expect(mobileBoxes[0]!.y).toBeLessThan(mobileBoxes[1]!.y)
  await page.screenshot({ path: testInfo.outputPath('design-reorder-mobile.jpg') })
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(heads).toHaveText(['Early voting', 'Election Day', 'Mail-in voting'], { timeout: 30_000 })
  await expect(icon.locator('svg.lucide-calendar-days')).toHaveCount(1)
  expect(errors).toEqual([])
})
