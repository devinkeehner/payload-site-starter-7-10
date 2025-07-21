import { Section, Container } from '@/components/layout'
import { CMSLink } from '@/components/site/link'
import { Badge } from '@/components/ui/badge'
import { Media } from '@/components/site/media'

import RichText from '@/components/site/rich-text'
import Link from 'next/link'

import type { Page } from '@/payload-types'

type HeroProps = NonNullable<Page['hero']>
export const MediumImpactHero = ({ links, media, richText, callToAction }: HeroProps) => {
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

        {media && typeof media === 'object' && (
          <div>
            <Media imgClassName="object-cover h-[500px]" priority resource={media} />
            {media?.caption && (
              <div className="mt-3">
                <RichText data={media.caption} enableGutter={false} />
              </div>
            )}
          </div>
        )}

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
