import { regenerateAndPersistSitemaps, getSitemapArtifact } from '@/lib/sitemaps'
import { triggerFrontendRevalidate } from '@/lib/utilities/revalidateFrontend'

declare global {
  // eslint-disable-next-line no-var
  var __sitemapBootstrapPromise: Promise<void> | undefined
}

const shouldBootstrapSitemaps = (): boolean => {
  if (process.env.DISABLE_SITEMAP_BOOTSTRAP === 'true') return false

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return process.env.AUTO_BOOTSTRAP_SITEMAPS === 'true'
  }

  if (process.env.NODE_ENV !== 'production') {
    return process.env.AUTO_BOOTSTRAP_SITEMAPS === 'true'
  }

  return true
}

async function revalidateGeneratedPaths(paths: string[]): Promise<void> {
  if (!paths.length) return

  try {
    await triggerFrontendRevalidate({
      paths,
      tags: ['payload:sitemaps'],
    })
  } catch (error) {
    console.error('[sitemaps] frontend revalidate after bootstrap failed', error)
  }
}

const artifactLooksStale = (xml: string | null | undefined): boolean => typeof xml === 'string' && xml.includes('.xml.xml')

async function bootstrapSitemaps(): Promise<void> {
  if (!shouldBootstrapSitemaps()) return

  const [{ default: configPromise }, { getPayload }] = await Promise.all([
    import('@payload-config'),
    import('payload'),
  ])
  const payload = await getPayload({ config: configPromise })

  try {
    const [rootArtifact, pagesArtifact, postsArtifact] = await Promise.all([
      getSitemapArtifact(payload, 'sitemap.xml', false),
      getSitemapArtifact(payload, 'pages-sitemap.xml', false),
      getSitemapArtifact(payload, 'posts-sitemap.xml', false),
    ])

    const needsRepair =
      artifactLooksStale(rootArtifact?.xml) || artifactLooksStale(pagesArtifact?.xml) || artifactLooksStale(postsArtifact?.xml)

    if (rootArtifact?.xml && pagesArtifact?.xml && postsArtifact?.xml && !needsRepair) {
      payload.logger.info('[sitemaps] startup bootstrap skipped; sitemap artifacts already exist')
      return
    }

    payload.logger.info(
      needsRepair
        ? '[sitemaps] startup bootstrap regenerating stale sitemap artifacts'
        : '[sitemaps] startup bootstrap generating sitemap artifacts',
    )
    const paths = await regenerateAndPersistSitemaps(payload)
    await revalidateGeneratedPaths(paths)
    payload.logger.info('[sitemaps] startup bootstrap completed')
  } catch (error) {
    payload.logger.error({ err: error }, '[sitemaps] startup bootstrap failed')
  }
}

export function triggerSitemapBootstrapOnStartup(): Promise<void> | undefined {
  if (!shouldBootstrapSitemaps()) return undefined

  if (!globalThis.__sitemapBootstrapPromise) {
    globalThis.__sitemapBootstrapPromise = bootstrapSitemaps().finally(() => {
      globalThis.__sitemapBootstrapPromise = undefined
    })
  }

  return globalThis.__sitemapBootstrapPromise
}
