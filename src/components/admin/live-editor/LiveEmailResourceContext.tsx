'use client'

import { createContext, useContext } from 'react'

export type LiveEmailResourceScope = { apiURL?: string }
export const LiveEmailResourceContext = createContext<LiveEmailResourceScope>({})
export const useLiveEmailResourceScope = () => useContext(LiveEmailResourceContext)

export function liveEmailOptionsURL(apiURL: string | undefined, params: URLSearchParams): string {
  if (!apiURL) throw new Error('Save this draft before choosing media or linked documents.')
  return `${apiURL}/options?${params.toString()}`
}
