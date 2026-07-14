import type { DocumentViewServerProps } from 'payload'

import { GraphicDesignCreateRedirect } from './GraphicDesignCreateRedirect'
import GraphicDesignStudioView from './GraphicDesignStudioView'

export default function GraphicDesignDefaultView(props: DocumentViewServerProps) {
  const doc = (props.doc || {}) as { id?: number | string }
  const id = props.id ?? doc.id

  if (id == null || String(id) === 'create') {
    return <GraphicDesignCreateRedirect />
  }

  return <GraphicDesignStudioView {...props} />
}
