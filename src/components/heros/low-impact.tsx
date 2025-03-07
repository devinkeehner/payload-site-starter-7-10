import React from 'react'

import { Container, Section } from '@/components/layout'
import { CMSLink } from '@/components/site/link'
import { Badge } from '@/components/ui/badge'

import Link from 'next/link'
import RichText from '@/components/site/rich-text'

import type { Page } from '@/payload-types'

export const LowImpactHero = ({ richText, links, callToAction }: Page['hero']) => {
  return (
    <Section className="bg-accent/30 border-b">
      <Container className="space-y-3 sm:space-y-6">
        {callToAction && (
          <Badge variant="outline" asChild>
            <Link href={callToAction.url || '#'} target="_blank" rel="noopener noreferrer">
              {callToAction.label}
            </Link>
          </Badge>
        )}

        {richText && <RichText data={richText} enableGutter={false} />}

        {Array.isArray(links) && links.length > 0 && (
          <ul className="flex gap-2">
            {links.map(({ link }, i) => {
              return (
                <li key={i}>
                  <CMSLink {...link} />
                </li>
              )
            })}
          </ul>
        )}
      </Container>
    </Section>
  )
}
