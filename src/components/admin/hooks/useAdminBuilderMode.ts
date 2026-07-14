'use client'

import { useEffect } from 'react'

/**
 * Marks full-screen admin builders so the shared Payload shell can get out of
 * the way. Keeping this in one hook prevents each Puck-style editor from
 * inventing its own header and scrolling overrides.
 */
export function useAdminBuilderMode(builderType: string) {
  useEffect(() => {
    const root = document.documentElement
    const attribute = 'data-hro-visual-builder'
    const previousValue = root.getAttribute(attribute)

    root.setAttribute(attribute, builderType)

    return () => {
      if (previousValue === null) root.removeAttribute(attribute)
      else root.setAttribute(attribute, previousValue)
    }
  }, [builderType])
}
