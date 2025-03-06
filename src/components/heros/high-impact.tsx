import { Section, Container } from '@/components/craft'
import { CMSLink } from '@/components/site/link'
import { Media } from '@/components/site/media'

import RichText from '@/components/site/rich-text'

import type { Page } from '@/payload-types'

export const HighImpactHero = ({ links, media, richText }: Page['hero']) => {
  return (
    <Section>
      <Container>
        {richText && <RichText data={richText} />}
        {Array.isArray(links) && links.length > 0 && (
          <div className="flex gap-2">
            {links.map(({ link }, i) => (
              <CMSLink key={i} {...link} />
            ))}
          </div>
        )}
        {media && typeof media === 'object' && <Media priority resource={media} />}
      </Container>
    </Section>
  )
}
