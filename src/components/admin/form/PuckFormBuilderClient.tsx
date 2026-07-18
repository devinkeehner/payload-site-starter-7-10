'use client'

import dynamic from 'next/dynamic'

import { PuckBuilderLoadBoundary } from '@/components/admin/puck/PuckBuilderLoadBoundary'

import type { PuckFormBuilderProps } from './PuckFormBuilderEditor'

const PuckFormBuilderEditor = dynamic(
  () => import('./PuckFormBuilderEditor').then((mod) => mod.PuckFormBuilderEditor),
  {
    loading: () => <div style={{ padding: 24 }}>Loading form builder…</div>,
    ssr: false,
  },
)

export function PuckFormBuilderClient(props: PuckFormBuilderProps) {
  return (
    <PuckBuilderLoadBoundary loadingLabel="Retrying form builder…">
      <PuckFormBuilderEditor {...props} />
    </PuckBuilderLoadBoundary>
  )
}
