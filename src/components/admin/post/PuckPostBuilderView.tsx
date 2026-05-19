import type { DocumentViewServerProps } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { postToPuckData } from '@/lib/puck/converters'
import { getPostPuckBlockSchema } from '@/lib/puck/schema'
import type { PuckPostDoc } from '@/lib/puck/types'

import { PuckPostBuilderClient } from './PuckPostBuilderClient'

export default function PuckPostBuilderView(props: DocumentViewServerProps) {
  const doc = props.doc as PuckPostDoc
  const id = props.id ?? doc?.id
  const user = props.req?.user

  if (!isSuperUser(user)) {
    return (
      <div style={{ padding: '2rem' }}>
        You do not have access to the post builder.
      </div>
    )
  }

  if (!id) {
    return (
      <div style={{ padding: '2rem' }}>
        Save this post before opening the post builder.
      </div>
    )
  }

  return (
    <PuckPostBuilderClient
      blockSchema={getPostPuckBlockSchema()}
      initialData={postToPuckData(doc)}
      postId={String(id)}
      title={typeof doc?.title === 'string' ? doc.title : 'Untitled post'}
    />
  )
}
