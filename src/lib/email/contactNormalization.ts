const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/

export function normalizeEmailAddress(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidEmailAddress(value: unknown): boolean {
  return EMAIL_PATTERN.test(normalizeEmailAddress(value))
}

export function normalizePhoneNumber(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/[^\d+]/gu, '') : ''
}

export function normalizePostalCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export function normalizeListName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/gu, ' ')
    : ''
}

export function getElasticSafeListName(tenantSlug: string | null | undefined, listName: string): string {
  const safeTenant = (tenantSlug || 'main').trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, '-')
  const safeName = normalizeListName(listName).toLowerCase().replace(/[^a-z0-9_-]+/gu, '-')
  return [safeTenant, safeName || 'list'].filter(Boolean).join('-')
}
