import type { CollectionAfterChangeHook } from 'payload'

export const revalidateRedirects: CollectionAfterChangeHook = async ({ doc, req: { payload } }) => {
  payload.logger.info(`Revalidating redirects`)

  const { revalidateTag } = await import('next/cache')
  revalidateTag('redirects', { expire: 0 })

  return doc
}
