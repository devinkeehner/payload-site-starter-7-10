'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'

import { useAdminBuilderMode } from '@/components/admin/hooks/useAdminBuilderMode'
import { PuckVisualBuilderStepNav } from '@/components/admin/puck/PuckVisualBuilderStepNav'
import type { GraphicScene } from '@/lib/graphics/studioTypes'

import styles from './graphic-design-studio.module.css'

const GraphicDesignStudioEditor = dynamic(
  () => import('./GraphicDesignStudioEditor').then((mod) => mod.GraphicDesignStudioEditor),
  {
    loading: () => <div className={styles.loading}>Loading design studio…</div>,
    ssr: false,
  },
)

export function GraphicDesignStudioClient(props: {
  canManageTemplates?: boolean
  designId: string | null
  initialScene: GraphicScene
  sourcePostId?: string | null
  tenantColors: { accent: string; background: string; primary: string }
  tenantId?: string | null
  title: string
}) {
  useAdminBuilderMode('graphic-design')
  const searchParams = useSearchParams()
  const returnToPostId = searchParams.get('fromPost') || props.sourcePostId

  return (
    <>
      <PuckVisualBuilderStepNav
        collectionLabel="Designs"
        collectionSlug="graphic-designs"
        documentId={props.designId}
        documentTitle={props.title}
        viewLabel="Design Studio"
      />
      <GraphicDesignStudioEditor {...props} returnToPostId={returnToPostId} />
    </>
  )
}
