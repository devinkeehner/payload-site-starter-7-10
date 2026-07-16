'use client'

import dynamic from 'next/dynamic'

import styles from '@/components/admin/puck/puck-page-builder.module.css'

import type { PuckFormBuilderProps } from './PuckFormBuilderEditor'

const PuckFormBuilderEditor = dynamic(
  () => import('./PuckFormBuilderEditor').then((mod) => mod.PuckFormBuilderEditor),
  {
    loading: () => <div className={styles.loading}>Loading form builder...</div>,
    ssr: false,
  },
)

export function PuckFormBuilderClient(props: PuckFormBuilderProps) {
  return <PuckFormBuilderEditor {...props} />
}
