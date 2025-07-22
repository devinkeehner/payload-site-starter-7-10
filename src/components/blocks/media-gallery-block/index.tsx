import React from 'react'
import { Section, Container } from '@/components/layout'
import type { MediaGalleryBlock as MediaGalleryBlockProps } from '@/payload-types'
import { Media } from '@/components/site/media'
import { cn } from '@/lib/utils'

export const MediaGalleryBlock: React.FC<MediaGalleryBlockProps> = ({ images }) => {
  if (!images || images.length === 0) return null

  return (
    <Section>
      <Container>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((item, idx) => {
            if (typeof item.media !== 'object') return null

            return (
              <figure key={item.id ?? idx} className="flex flex-col items-center">
                <Media resource={item.media} imgClassName="border rounded" />
                {item.caption && (
                  <figcaption className={cn('mt-2 text-sm text-muted-foreground text-center')}>{item.caption}</figcaption>
                )}
              </figure>
            )
          })}
        </div>
      </Container>
    </Section>
  )
}
