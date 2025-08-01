import { cn } from '@/lib/utils'
import React from 'react'
import RichText from '@/components/site/rich-text'

import type { ContentBlock as ContentBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/site/link'
import { Container, Section } from '@/components/layout'

export const ContentBlock = (props: ContentBlockProps) => {
  const { columns } = props

  return (
    <Section>
      <Container>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-y-8 gap-x-4 md:gap-x-8 lg:gap-x-16">
          {columns &&
            columns.length > 0 &&
            columns.map((col, index) => {
              const { enableLink, link, richText, size } = col

              return (
                <div
                  className={cn(`col-span-1`, {
                    'sm:col-span-2 md:col-span-4 lg:col-span-12': size === 'full',
                    'sm:col-span-1 md:col-span-2 lg:col-span-6': size === 'half',
                    'sm:col-span-1 md:col-span-2 lg:col-span-4': size === 'oneThird',
                    'sm:col-span-2 md:col-span-3 lg:col-span-8': size === 'twoThirds',
                  })}
                  key={index}
                >
                  {richText && <RichText data={richText} enableGutter={false} />}

                  {enableLink && <CMSLink {...link} />}
                </div>
              )
            })}
        </div>
      </Container>
    </Section>
  )
}
