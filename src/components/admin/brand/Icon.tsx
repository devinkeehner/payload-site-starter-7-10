'use client'

import React from 'react'
import { useTheme } from '@payloadcms/ui'
import Image from 'next/image'

const resolveEffectiveTheme = (theme: 'light' | 'dark' | 'auto' | undefined): 'light' | 'dark' => {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export default function Icon() {
  const { theme } = useTheme()
  const mode = resolveEffectiveTheme(theme as 'light' | 'dark' | 'auto' | undefined)
  const src = mode === 'dark' ? '/brand/icon-dark.svg' : '/brand/icon-light.svg'

  return (
    <Image
      src={src}
      alt="Admin Icon"
      width={28}
      height={28}
      priority
      style={{
        height: 28,
        width: 28,
        display: 'block',
      }}
    />
  )
}
