'use client'
import React from 'react'

const Logo: React.FC = () => {
  const theme = typeof window !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : 'light'
  const src = theme === 'dark' ? '/brand/logo-dark.svg' : '/brand/logo-light.svg'
  return <img src={src} alt="Admin Logo" style={{ height: '32px' }} />
}

export default Logo
