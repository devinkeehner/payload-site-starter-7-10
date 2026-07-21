import type { DocumentViewServerProps } from 'payload'

import { canUseBuilders } from '@/lib/access/isSuperUser'
import { createDefaultGraphicScene, type GraphicScene } from '@/lib/graphics/studioTypes'

import { GraphicDesignStudioClient } from './GraphicDesignStudioClient'

type RelationValue = number | string | { id?: number | string } | null | undefined

type GraphicDesignDoc = {
  id?: string | number
  primaryTenant?: RelationValue
  sourcePost?: RelationValue
  studioScene?: GraphicScene | null
  tenant?: RelationValue
  title?: string | null
}

function getRelationId(value: RelationValue): string | null {
  if (value == null) return null
  if (typeof value === 'object') return value.id == null ? null : String(value.id)
  return String(value)
}

export default function GraphicDesignStudioView(props: DocumentViewServerProps) {
  if (!canUseBuilders(props.user)) {
    return <div style={{ padding: '2rem' }}>Only alpha testers and super admins can use Canvas.</div>
  }

  const doc = (props.doc || {}) as GraphicDesignDoc
  const id = props.id ?? doc.id

  return (
    <div data-hro-fullscreen-builder="graphic-design" style={{ display: 'contents' }}>
      <GraphicDesignStudioClient
        designId={id == null ? null : String(id)}
        initialScene={doc.studioScene || createDefaultGraphicScene()}
        sourcePostId={getRelationId(doc.sourcePost)}
        tenantColors={{ accent: '#a71e22', background: '#ffffff', primary: '#0b1e3a' }}
        tenantId={getRelationId(doc.tenant) || getRelationId(doc.primaryTenant)}
        title={doc.title || 'Untitled graphic'}
      />
    </div>
  )
}
