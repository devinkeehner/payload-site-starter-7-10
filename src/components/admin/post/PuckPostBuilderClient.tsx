'use client'

import dynamic from 'next/dynamic'

import type { PuckPostBuilderProps } from './PuckPostBuilderEditor'

const PuckPostBuilderEditor = dynamic(
  () => import('./PuckPostBuilderEditor').then((mod) => mod.PuckPostBuilderEditor),
  {
    ssr: false,
  },
)

export function PuckPostBuilderClient(props: PuckPostBuilderProps) {
  return <PuckPostBuilderEditor {...props} />
}
