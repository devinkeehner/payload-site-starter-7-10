import RichText from '@/components/site/rich-text'
import React from 'react'

import { Width } from '../width'
import { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

export const Message: React.FC<{ message: SerializedEditorState }> = ({ message }) => {
  return (
    <Width width={100}>
      {message && <RichText data={message as unknown as DefaultTypedEditorState} />}
    </Width>
  )
}
