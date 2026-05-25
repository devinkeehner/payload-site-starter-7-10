'use client'

import type { ListViewClientProps } from 'payload'

import { DefaultListView, useConfig } from '@payloadcms/ui'
import { useEffect } from 'react'

type ProfileDefaultListViewProps = ListViewClientProps & {
  profileCollectionSlug: string
}

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '')

const shouldOpenProfile = (pathname: string, adminRoute: string, collectionSlug: string) => {
  const basePath = `${trimTrailingSlash(adminRoute)}/collections/${collectionSlug}/`

  if (!pathname.startsWith(basePath)) return false

  const itemPath = pathname.slice(basePath.length)

  return Boolean(itemPath) && !itemPath.includes('/') && itemPath !== 'create'
}

export function ProfileDefaultListView({
  profileCollectionSlug,
  ...props
}: ProfileDefaultListViewProps) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()

  useEffect(() => {
    const rewriteDocumentLinks = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
        if (anchor.dataset.profileListView === profileCollectionSlug) return

        const href = anchor.getAttribute('href')
        if (!href) return

        try {
          const url = new URL(href, window.location.origin)

          if (!shouldOpenProfile(url.pathname, adminRoute, profileCollectionSlug)) return

          url.pathname = `${url.pathname}/profile`
          anchor.setAttribute('href', `${url.pathname}${url.search}${url.hash}`)
          anchor.dataset.profileListView = profileCollectionSlug
        } catch {
          // Ignore non-standard href values that cannot be parsed as admin URLs.
        }
      })
    }

    rewriteDocumentLinks()

    const observer = new MutationObserver(rewriteDocumentLinks)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [adminRoute, profileCollectionSlug])

  return <DefaultListView {...props} />
}
