'use client'

import React from 'react'

import {
  ADMIN_PALETTE_STORAGE_KEY,
  applyAdminPalette,
  getStoredAdminPalette,
  type AdminPalette,
} from './adminPalette'

export function AdminPaletteProvider({ children }: { children?: React.ReactNode }) {
  React.useEffect(() => {
    applyAdminPalette(getStoredAdminPalette())

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ADMIN_PALETTE_STORAGE_KEY) return
      applyAdminPalette(event.newValue === 'color' ? 'color' : 'default')
    }

    const handlePaletteChange = (event: Event) => {
      const palette = (event as CustomEvent<AdminPalette>).detail
      applyAdminPalette(palette === 'color' ? 'color' : 'default')
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('admin-palette-change', handlePaletteChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('admin-palette-change', handlePaletteChange)
    }
  }, [])

  return <>{children}</>
}

export default AdminPaletteProvider
