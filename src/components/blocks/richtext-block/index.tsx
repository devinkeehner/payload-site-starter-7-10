import React from 'react'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
export const RichTextBlock: React.FC<{ richText: any }> = ({ richText }) => {
  if (!richText) return null

  const html = typeof richText === 'string' ? richText : convertLexicalToHTML(richText)

  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
};
