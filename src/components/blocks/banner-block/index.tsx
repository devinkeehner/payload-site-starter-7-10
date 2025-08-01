import type { BannerBlock as BannerBlockProps } from 'src/payload-types'

import { Section, Container } from '@/components/layout'
import { cn } from '@/lib/utils'

import RichText from '@/components/site/rich-text'
import React from 'react'

type Props = {
  className?: string
} & BannerBlockProps

export const BannerBlock: React.FC<Props> = ({ className, content, style }) => {
  return (
    <Section className={cn(className)}>
      <Container>
        <div
          className={cn('border py-3 px-6 flex items-center rounded', {
            'border-border bg-card': style === 'info',
            'border-error bg-error/30': style === 'error',
            'border-success bg-success/30': style === 'success',
            'border-warning bg-warning/30': style === 'warning',
          })}
        >
          <RichText data={content} enableGutter={false} enableProse={false} />
        </div>
      </Container>
    </Section>
  )
}
