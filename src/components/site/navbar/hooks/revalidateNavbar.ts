// import type { CollectionAfterChangeHook } from 'payload/types'

// import { revalidateTag } from 'next/cache'

// export const revalidateNavbar: CollectionAfterChangeHook = async ({ doc, req: { payload, context } }) => {
//   if (!context.disableRevalidate) {
//     payload.logger.info(`Revalidating navbar`)

//     revalidateTag('navbar')
//   }

//   return doc
// }
