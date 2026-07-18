import type { GlobalAfterChangeHook } from 'payload'

export const revalidateHeader: GlobalAfterChangeHook = async ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info(`Revalidating header`)

    const { revalidateTag } = await import('next/cache')
    revalidateTag('global_header', { expire: 0 })
  }

  return doc
}
