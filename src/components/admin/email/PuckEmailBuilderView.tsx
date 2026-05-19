import type { DocumentViewServerProps } from 'payload'

import { emailToPuckData } from '@/lib/puck/converters'
import { getEmailPuckBlockSchema } from '@/lib/puck/schema'
import type { PuckEmailDoc } from '@/lib/puck/types'

import { PuckEmailBuilderClient } from './PuckEmailBuilderClient'

export default function PuckEmailBuilderView(props: DocumentViewServerProps) {
  const doc = props.doc as PuckEmailDoc
  const id = props.id ?? doc?.id

  if (!id) {
    return (
      <div style={{ padding: 24 }}>
        Save this email before opening the email builder.
      </div>
    )
  }

  const blockSchema = getEmailPuckBlockSchema()

  return (
    <PuckEmailBuilderClient
      blockSchema={blockSchema}
      initialData={emailToPuckData(doc)}
      emailId={String(id)}
      title={doc.title || 'Untitled email'}
    />
  )
}
