'use client'

import { createContext, useContext } from 'react'

export type LiveEmailResourceScope = { emailId?: string | number; tenantId?: string | number }
export const LiveEmailResourceContext = createContext<LiveEmailResourceScope>({})
export const useLiveEmailResourceScope = () => useContext(LiveEmailResourceContext)

export function liveEmailOptionsURL(emailId: string | number | undefined, params: URLSearchParams): string {
  if (emailId == null) throw new Error('Save this email before choosing media or linked documents.')
  return `/api/live-editor/emails/${encodeURIComponent(String(emailId))}/options?${params.toString()}`
}
