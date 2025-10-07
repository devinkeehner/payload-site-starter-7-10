'use client'

import React from 'react'
import { useTheme } from '@payloadcms/ui'

const resolveEffectiveTheme = (theme: 'light' | 'dark' | 'auto' | undefined): 'light' | 'dark' => {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export default function Logo() {
  const { theme } = useTheme()
  const mode = resolveEffectiveTheme(theme as any)
  const src = mode === 'dark' ? '/brand/logo-dark.svg' : '/brand/logo-light.svg'

  return (
    <img
      src={src}
      alt="Admin Logo"
      style={{
        height: 96,
        width: 'auto',
        display: 'block',
      }}
    />
  )
}
