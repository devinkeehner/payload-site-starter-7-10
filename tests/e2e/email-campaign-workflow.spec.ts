import { expect, test } from '@playwright/test'

const emailId = process.env.EMAIL_E2E_ID
const storageState =
  process.env.PLAYWRIGHT_STORAGE_STATE ||
  process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE
const hasAuthenticatedFixture = Boolean(emailId && storageState)

test.describe('authenticated email campaign workflow', () => {
  test.skip(!hasAuthenticatedFixture, 'Set EMAIL_E2E_ID and PLAYWRIGHT_STORAGE_STATE to run authenticated campaign smoke coverage.')

  test('campaign route resumes a canonical workflow stage', async ({ page }) => {
    await page.goto(`/admin/collections/emails/${emailId}/campaign`)
    await page.waitForURL((url) =>
      /\/admin\/collections\/emails\/[^/]+\/(visual|audience|review|delivery|results)$/.test(url.pathname),
    )

    await expect(page).not.toHaveURL(/\/campaign$/)
  })

  test('Audience, Review, Delivery, and Results share the five-stage shell', async ({ page }) => {
    for (const route of ['audience', 'review', 'delivery', 'results']) {
      await page.goto(`/admin/collections/emails/${emailId}/${route}`)

      const workflowNav = page.getByRole('navigation', { name: 'Campaign workflow' })
      await expect(workflowNav).toBeVisible()
      await expect(workflowNav.getByText('Compose', { exact: true })).toBeVisible()
      await expect(workflowNav.getByText('Audience', { exact: true })).toBeVisible()
      await expect(workflowNav.getByText('Review & Test', { exact: true })).toBeVisible()
      await expect(workflowNav.getByText('Delivery', { exact: true })).toBeVisible()
      await expect(workflowNav.getByText('Results', { exact: true })).toBeVisible()

      await expect(page.getByText('Overview', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Process Queued Send', { exact: true })).toHaveCount(0)
    }
  })

  test('Compose has autosave and one forward workflow action', async ({ page }) => {
    await page.goto(`/admin/collections/emails/${emailId}/visual`)

    await expect(page.getByRole('button', { name: 'Continue to Audience' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check Links' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Send Test Email' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)

    await expect(page.getByRole('navigation', { name: 'Campaign workflow' })).toBeVisible()
  })

  test('mobile workflow navigation remains contained and keyboard reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/admin/collections/emails/${emailId}/review`)

    const workflowNav = page.getByRole('navigation', { name: 'Campaign workflow' })
    await expect(workflowNav).toBeVisible()
    const currentStep = workflowNav.locator('[aria-current="step"]')
    await currentStep.focus()
    await expect(currentStep).toBeFocused()

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(375)
  })

  test('Delivery smoke coverage never confirms a production mutation', async ({ page }) => {
    await page.goto(`/admin/collections/emails/${emailId}/delivery`)

    await expect(page.getByText(/Eastern Time/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Confirm and Send|Confirm Schedule/ })).toHaveCount(0)
  })
})
