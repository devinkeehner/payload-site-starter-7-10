import type { DocumentViewServerProps } from 'payload'

import { formToPuckData } from '@/lib/puck/converters'
import { getFormPuckBlockSchema } from '@/lib/puck/schema'
import type { PuckFormDoc } from '@/lib/puck/types'

import { PuckFormBuilderClient } from './PuckFormBuilderClient'

export default function PuckFormBuilderView(props: DocumentViewServerProps) {
  const doc = props.doc as PuckFormDoc
  const id = props.id ?? doc?.id

  if (!id) {
    return (
      <div style={{ padding: 24 }}>
        Save this form before opening the form builder.
      </div>
    )
  }

  return (
    <PuckFormBuilderClient
      blockSchema={getFormPuckBlockSchema()}
      formId={String(id)}
      initialData={formToPuckData(doc)}
      submitButtonLabel={doc.submitButtonLabel}
      title={typeof doc?.title === 'string' ? doc.title : 'Untitled form'}
    />
  )
}
