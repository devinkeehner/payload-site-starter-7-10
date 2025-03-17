import RichText from '@/components/site/rich-text'
import React from 'react'

import { Width } from '../width'
import { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

export const Message: React.FC<{ message: SerializedEditorState }> = ({ message }) => {
  return <Width width={100}>{message && <RichText data={message} />}</Width>
}
