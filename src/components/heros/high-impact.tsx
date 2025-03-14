import { Section, Container } from '@/components/layout'
import { CMSLink } from '@/components/site/link'
import { Media } from '@/components/site/media'
import { Badge } from '@/components/ui/badge'

import RichText from '@/components/site/rich-text'
import Link from 'next/link'

import type { Page } from '@/payload-types'

export const HighImpactHero = ({ links, media, richText, callToAction }: Page['hero']) => {
  return (
    <Section className="bg-accent/30 border-b">
      <Container className="space-y-6 sm:space-y-12 !text-center">
        {callToAction && (
          <Badge variant={callToAction.appearance || 'secondary'} asChild>
            <Link href={callToAction.url || '#'} target="_blank" rel="noopener noreferrer">
              {callToAction.label}
            </Link>
          </Badge>
        )}

        {richText && <RichText data={richText} />}

        {Array.isArray(links) && links.length > 0 && (
          <div className="flex gap-2 justify-center">
            {links.map(({ link }, i) => (
              <CMSLink key={i} {...link} />
            ))}
          </div>
        )}

        {media && typeof media === 'object' && (
          <div>
            <Media
              className="-mx-4 md:-mx-8 2xl:-mx-16"
              imgClassName="object-cover h-[600px]"
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
