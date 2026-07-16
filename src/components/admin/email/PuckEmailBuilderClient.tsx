'use client'

import dynamic from 'next/dynamic'

import type { PuckEmailBuilderProps } from './PuckEmailBuilderEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'

const PuckEmailBuilderEditor = dynamic(
  () => import('./PuckEmailBuilderEditor').then((mod) => mod.PuckEmailBuilderEditor),
  {
    loading: () => <div className={styles.loading}>Loading email builder...</div>,
    ssr: false,
  },
)

export function PuckEmailBuilderClient(props: PuckEmailBuilderProps) {
  return <PuckEmailBuilderEditor {...props} />
}
