import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function getSiteSEO(tenantSlug: string) {
  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'site-seo',
    depth: 2,
    limit: 1,
    pagination: false,
    where: {
      'tenant.slug': {
        equals: tenantSlug,
      },
    },
  })

  return result.docs?.[0] || null
}
