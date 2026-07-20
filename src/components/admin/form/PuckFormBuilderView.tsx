import type { DocumentViewServerProps } from 'payload'

import { formToPuckData } from '@/lib/puck/converters'
import { getFormPuckBlockSchema } from '@/lib/puck/schema'
import type { PuckFormDoc } from '@/lib/puck/types'

import { PuckFormBuilderClient } from './PuckFormBuilderClient'
import { PuckFormCreateClient } from './PuckFormCreateClient'
import { getLexicalPlainText } from './formSettings'

export default function PuckFormBuilderView(props: DocumentViewServerProps) {
  const doc = props.doc as PuckFormDoc
  const id = props.id ?? doc?.id

  if (!id) {
    return <PuckFormCreateClient />
  }

  return (
    <PuckFormBuilderClient
      blockSchema={getFormPuckBlockSchema()}
      formId={String(id)}
      initialData={formToPuckData(doc)}
      initialSettings={{
        confirmationMessage: getLexicalPlainText(doc.confirmationMessage)
          || 'Thanks! Your response has been received.',
        confirmationType: doc.confirmationType === 'redirect' ? 'redirect' : 'message',
        enableHoneypot: doc.enableHoneypot !== false,
        enableTurnstile: doc.enableTurnstile === true,
        redirectURL: typeof doc.redirect?.url === 'string' ? doc.redirect.url : '',
        submitButtonLabel: typeof doc.submitButtonLabel === 'string' ? doc.submitButtonLabel : 'Submit',
        title: typeof doc?.title === 'string' ? doc.title : 'Untitled form',
      }}
    />
  )
}
