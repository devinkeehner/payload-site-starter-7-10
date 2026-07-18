'use client'

import React, { createContext, useContext, useMemo } from 'react'

export type TenantOption = {
  label: string
  value: string
}

const TenantOptionsContext = createContext<TenantOption[] | null>(null)

export function TenantOptionsClientProvider({
  activeTenantOptions,
  children,
}: {
  activeTenantOptions: TenantOption[] | null
  children?: React.ReactNode
}) {
  const options = useMemo(
    () => activeTenantOptions,
    [activeTenantOptions],
  )

  return (
    <TenantOptionsContext.Provider value={options}>
      {children}
    </TenantOptionsContext.Provider>
  )
}

export function useActiveTenantOptions() {
  return useContext(TenantOptionsContext)
}
