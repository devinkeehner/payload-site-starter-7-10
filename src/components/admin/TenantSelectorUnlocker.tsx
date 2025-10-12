'use client'

import React, { PropsWithChildren, useEffect, useMemo, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

const isDocumentEditPath = (pathname: string | null): boolean => {
  if (!pathname) return false
  const normalized = pathname.replace(/^\/?admin\//, '').replace(/^[\/]+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 3) return false
  if (segments[0] !== 'collections') return false
  const docSegment = segments[2]
  if (!docSegment) return false
  if (['create', 'trash', 'versions', 'api'].includes(docSegment)) return false
  return true
}

const TenantSelectorUnlocker: React.FC<PropsWithChildren> = ({ children }) => {
  const pathname = usePathname()
  const isEditView = useMemo(() => isDocumentEditPath(pathname), [pathname])

  const { setEntityType } = useTenantSelection()
  const forcedRef = useRef(false)

  useEffect(() => {
    if (!setEntityType) return

    if (isEditView) {
      if (!forcedRef.current) {
        setEntityType('global')
        forcedRef.current = true
      }
    } else if (forcedRef.current) {
      setEntityType(undefined)
      forcedRef.current = false
    }
  }, [isEditView, setEntityType])

  return <>{children}</>
}

export default TenantSelectorUnlocker
