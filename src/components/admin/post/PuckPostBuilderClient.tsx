'use client'

import dynamic from 'next/dynamic'

import { PuckBuilderLoadBoundary } from '@/components/admin/puck/PuckBuilderLoadBoundary'

import type { PuckPostBuilderProps } from './PuckPostBuilderEditor'

const PuckPostBuilderEditor = dynamic(
  () => import('./PuckPostBuilderEditor').then((mod) => mod.PuckPostBuilderEditor),
  {
    loading: () => <div style={{ padding: 24 }}>Loading post builder…</div>,
    ssr: false,
  },
)

export function PuckPostBuilderClient(props: PuckPostBuilderProps) {
  return (
    <PuckBuilderLoadBoundary loadingLabel="Retrying post builder…">
      <PuckPostBuilderEditor {...props} />
    </PuckBuilderLoadBoundary>
  )
}
