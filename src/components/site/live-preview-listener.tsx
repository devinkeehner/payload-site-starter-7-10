'use client'

import { getClientSideURL } from '@/lib/utilities/getURL'
import { RefreshRouteOnSave as PayloadLivePreview } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'
import React from 'react'

export const LivePreviewListener: React.FC = () => {
  const router = useRouter()
  const serverURL = process.env.NEXT_PUBLIC_PAYLOAD_URL || getClientSideURL()
  return <PayloadLivePreview refresh={router.refresh} serverURL={serverURL} />
}
