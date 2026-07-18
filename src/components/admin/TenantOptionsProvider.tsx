import type { Payload, TypedUser } from 'payload'
import React from 'react'

import {
  TenantOptionsClientProvider,
  type TenantOption,
} from './TenantOptionsContext'

type Props = {
  children?: React.ReactNode
  payload: Payload
  user?: TypedUser | null
}

export default async function TenantOptionsProvider({ children, payload, user }: Props) {
  let activeTenantOptions: TenantOption[] | null = null

  if (user) {
    try {
      const activeTenants = await payload.find({
        collection: 'tenants',
        depth: 0,
        limit: 0,
        overrideAccess: true,
        pagination: false,
        select: {
          name: true,
        },
        sort: 'name',
        where: {
          archived: {
            not_equals: true,
          },
        },
      })

      activeTenantOptions = activeTenants.docs.map((tenant) => ({
        label: String(tenant.name || tenant.id),
        value: String(tenant.id),
      }))
    } catch {
      // Fall back to Payload's tenant options if the active-site query fails.
    }
  }

  return (
    <TenantOptionsClientProvider activeTenantOptions={activeTenantOptions}>
      {children}
    </TenantOptionsClientProvider>
  )
}
