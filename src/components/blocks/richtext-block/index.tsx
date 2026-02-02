import React from 'react'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

type RichTextValue = Parameters<typeof convertLexicalToHTML>[0] | string

export const RichTextBlock: React.FC<{ richText: RichTextValue | null | undefined }> = ({ richText }) => {
  if (!richText) return null

  const html = typeof richText === 'string' ? richText : convertLexicalToHTML(richText)

  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
};
