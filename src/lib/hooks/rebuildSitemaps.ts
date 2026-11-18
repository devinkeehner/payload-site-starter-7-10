import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { regenerateAndPersistSitemaps } from '@/lib/sitemaps'
import { triggerFrontendRevalidate } from '@/lib/utilities/revalidateFrontend'

type StatusDoc = {
  _status?: string | null
  status?: string | null
}

const getPublicationStatus = (doc: StatusDoc | null | undefined): string | undefined => {
  if (!doc) return undefined
  return doc._status || doc.status || undefined
}

const shouldRegenerateForPublishedChange = (doc: StatusDoc | null | undefined, previousDoc: StatusDoc | null | undefined): boolean => {
  const currentStatus = getPublicationStatus(doc)
  const previousStatus = getPublicationStatus(previousDoc)

  return currentStatus === 'published' || previousStatus === 'published'
}

const revalidateSitemapPaths = async (paths: string[]): Promise<void> => {
  await triggerFrontendRevalidate({
    paths,
    tags: ['payload:sitemaps'],
  })
}

const safeRegenerateSitemaps = async (payload: { logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void } }) => {
  try {
    payload.logger.info('Regenerating sitemap artifacts')
    const sitemapPaths = await regenerateAndPersistSitemaps(payload as never)
    await revalidateSitemapPaths(sitemapPaths)
  } catch (error) {
    payload.logger.error('Failed to regenerate sitemap artifacts', error)
  }
}

export const rebuildSitemapsAfterPublishedChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req: { payload },
}) => {
  if (shouldRegenerateForPublishedChange(doc as StatusDoc, previousDoc as StatusDoc)) {
    await safeRegenerateSitemaps(payload as never)
  }

  return doc
}

export const rebuildSitemapsAfterPublishedDelete: CollectionAfterDeleteHook = async ({ doc, req: { payload } }) => {
  if (getPublicationStatus(doc as StatusDoc) === 'published') {
    await safeRegenerateSitemaps(payload as never)
  }

  return doc
}

export const rebuildSitemapsAfterTenantChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req: { payload } }) => {
  const currentSlug = typeof (doc as { slug?: unknown })?.slug === 'string' ? (doc as { slug: string }).slug : undefined
  const previousSlug =
    typeof (previousDoc as { slug?: unknown } | undefined)?.slug === 'string'
      ? ((previousDoc as { slug: string }).slug as string)
      : undefined

  const visibilityChanged =
    Boolean(doc.isPrivate) !== Boolean(previousDoc?.isPrivate) ||
    Boolean(doc.archived) !== Boolean(previousDoc?.archived)
  if (currentSlug !== previousSlug || visibilityChanged) {
    await safeRegenerateSitemaps(payload as never)
    await triggerFrontendRevalidate({
      paths: ['/', ...(currentSlug ? [`/${currentSlug}`] : []), '/caucus-members', '/leadership-team'],
      tags: ['payload:sitemaps', 'payload:rep-info', ...(currentSlug ? [`tenant:${currentSlug}`] : [])],
    })
  }

  return doc
}

export const rebuildSitemapsAfterTenantDelete: CollectionAfterDeleteHook = async ({ req: { payload } }) => {
  await safeRegenerateSitemaps(payload as never)
}
