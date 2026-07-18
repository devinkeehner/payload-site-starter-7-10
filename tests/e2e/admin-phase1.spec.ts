import { expect, test } from '@playwright/test'

test.describe('authenticated HRO admin Phase 1', () => {
  test.skip(
    !process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE,
    'Set PLAYWRIGHT_ADMIN_STORAGE_STATE to an authenticated Payload storage-state file.',
  )

  test('renders the approved dashboard actions and shortcuts in order', async ({ page }) => {
    await page.goto('/admin')

    await expect(page.getByText('Welcome back')).toHaveCount(0)
    await expect(page.getByText('Choose a common task')).toHaveCount(0)

    const quickActions = page.locator('.campaign-dashboard-widget__task-label')
    await expect(quickActions).toHaveText(['Create Post', 'Posts', 'Create a Form', 'Add Media'])

    const shortcuts = page.locator('.campaign-dashboard-widget__shortcut strong')
    await expect(shortcuts).toHaveText([
      'Edit Navbar',
      'Update Home Page Images',
      'Update Social Media',
      'Edit Towns',
    ])
  })

  test('opens compact Posts navigation with iconless recent document links', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('button', { name: 'Posts' }).click()

    const panel = page.getByRole('region', { name: 'Posts navigation' })
    await expect(panel.getByRole('link', { name: 'Create Post' })).toBeVisible()
    await expect(panel.getByRole('link', { name: 'Posts', exact: true })).toBeVisible()

    const recentLinks = panel.locator('.campaign-admin-nav__panel-link--document')
    await expect(recentLinks).toHaveCount(3)
    await expect(recentLinks.locator('.campaign-admin-nav__panel-link-icon')).toHaveCount(0)
  })

  test('exposes valid navbar destinations as descriptive new-tab links', async ({ page }) => {
    await page.goto('/admin')

    const links = page.locator('.campaign-dashboard-widget__navbar-link[data-state="valid"] > a')
    const count = await links.count()
    test.skip(count === 0, 'The selected site has no resolved navbar links.')

    await expect(links.first()).toHaveAttribute('target', '_blank')
    await expect(links.first()).toHaveAttribute('rel', /noopener/)
    await expect(links.first()).toHaveAttribute('title', /^https?:\/\//)
  })
})
