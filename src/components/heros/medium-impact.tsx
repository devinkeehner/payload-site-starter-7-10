import { Section, Container } from '@/components/layout'
import { CMSLink } from '@/components/site/link'
import { Badge } from '@/components/ui/badge'
import { Media } from '@/components/site/media'

import RichText from '@/components/site/rich-text'
import Link from 'next/link'

import type { Page } from '@/payload-types'

export const MediumImpactHero = ({ links, media, richText, callToAction }: Page['hero']) => {
  return (
    <Section className="border-b bg-accent/30">
      <Container className="space-y-6 sm:space-y-8">
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

        {media && typeof media === 'object' && (
          <div>
            <Media
              className="-mx-4 md:-mx-8 2xl:-mx-16"
              imgClassName=""
              priority
              resource={media}
            />
            {media?.caption && (
              <div className="mt-3">
                <RichText data={media.caption} enableGutter={false} />
              </div>
            )}
          </div>
        )}
      </Container>
    </Section>
  )
}
