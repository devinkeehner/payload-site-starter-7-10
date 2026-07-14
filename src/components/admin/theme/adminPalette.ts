'use client'

export type AdminPalette = 'default' | 'color'

export const ADMIN_PALETTE_STORAGE_KEY = 'hro-admin-palette'
const LEGACY_ADMIN_PALETTE_STORAGE_KEY = 'campaign-admin-palette'

export function getStoredAdminPalette(): AdminPalette {
  if (typeof window === 'undefined') return 'default'
  const stored =
    window.localStorage.getItem(ADMIN_PALETTE_STORAGE_KEY) ||
    window.localStorage.getItem(LEGACY_ADMIN_PALETTE_STORAGE_KEY)
  return stored === 'color' ? 'color' : 'default'
}

export function applyAdminPalette(palette: AdminPalette) {
  if (typeof document === 'undefined') return

  if (palette === 'color') {
    document.documentElement.setAttribute('data-admin-palette', 'color')
    return
  }

  document.documentElement.removeAttribute('data-admin-palette')
}

export function storeAdminPalette(palette: AdminPalette) {
  if (typeof window === 'undefined') return

  if (palette === 'color') {
    window.localStorage.setItem(ADMIN_PALETTE_STORAGE_KEY, palette)
    window.localStorage.removeItem(LEGACY_ADMIN_PALETTE_STORAGE_KEY)
    return
  }

  window.localStorage.removeItem(ADMIN_PALETTE_STORAGE_KEY)
  window.localStorage.removeItem(LEGACY_ADMIN_PALETTE_STORAGE_KEY)
}
