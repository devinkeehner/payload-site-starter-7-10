'use client'

import dynamic from 'next/dynamic'

import { PuckBuilderLoadBoundary } from '@/components/admin/puck/PuckBuilderLoadBoundary'

import type { PuckEmailBuilderProps } from './PuckEmailBuilderEditor'

const PuckEmailBuilderEditor = dynamic(
  () => import('./PuckEmailBuilderEditor').then((mod) => mod.PuckEmailBuilderEditor),
  {
    loading: () => <div style={{ padding: 24 }}>Loading email builder…</div>,
    ssr: false,
  },
)

export function PuckEmailBuilderClient(props: PuckEmailBuilderProps) {
  return (
    <PuckBuilderLoadBoundary loadingLabel="Retrying email builder…">
      <PuckEmailBuilderEditor {...props} />
    </PuckBuilderLoadBoundary>
  )
}
