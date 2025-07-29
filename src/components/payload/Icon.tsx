'use client'
import React from 'react'

const Icon: React.FC = () => {
  const theme = typeof window !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : 'light'
  const src = theme === 'dark' ? '/brand/icon-dark.svg' : '/brand/icon-light.svg'
  return <img src={src} alt="Breadcrumb Icon" style={{ height: '16px' }} />
}

export default Icon
