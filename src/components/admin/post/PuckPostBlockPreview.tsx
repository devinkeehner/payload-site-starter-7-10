'use client'

import React from 'react'

import { RenderPostBlocks } from '@/components/blocks/post-layout'

type BlockProps = Record<string, unknown>

function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        alignItems: 'center',
        border: '1px dashed hsl(var(--border))',
        borderRadius: 8,
        color: 'hsl(var(--muted-foreground))',
        display: 'flex',
        justifyContent: 'center',
        minHeight: 88,
        padding: 16,
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  )
}

export function PuckPostBlockPreview({
  blockType,
  props,
}: {
  blockType: string
  props: BlockProps
}) {
  if (blockType === 'postBody' && !props.content) {
    return <Placeholder label="Post body renders the existing Content tab rich text." />
  }

  return <RenderPostBlocks blocks={[{ ...props, blockType }]} content={props.content as never} />
}
