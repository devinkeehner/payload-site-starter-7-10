import { afterEach, expect, it, vi } from 'vitest'
import { designPreviewFrontend } from './designSitePreview'

afterEach(() => vi.unstubAllEnvs())

it('recognizes the production editor when the optional preview setting is absent', () => {
  for (const name of ['PREVIEW_FRONTEND_ORIGIN', 'FRONTEND_SERVER_URL', 'NEXT_PUBLIC_SITE_URL']) vi.stubEnv(name, '')
  expect(designPreviewFrontend('https://admin.cthousegop.com').href).toBe('https://www.cthousegop.com/api/live-editor-design-preview')
  expect(() => designPreviewFrontend('http://localhost:3000')).toThrow(/no website preview/)
  vi.stubEnv('FRONTEND_SERVER_URL', 'https://staging.example.org')
  expect(designPreviewFrontend('https://cms.example.org').origin).toBe('https://staging.example.org')
  vi.stubEnv('PREVIEW_FRONTEND_ORIGIN', 'https://cms.example.org')
  expect(() => designPreviewFrontend('https://cms.example.org')).toThrow(/separate frontend/)
})
