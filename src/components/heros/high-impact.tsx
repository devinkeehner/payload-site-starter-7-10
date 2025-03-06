import { Section, Container } from '@/components/craft'
import { CMSLink } from '@/components/site/link'
import { Media } from '@/components/site/media'

import RichText from '@/components/site/rich-text'

import type { Page } from '@/payload-types'

export const HighImpactHero = ({ links, media, richText }: Page['hero']) => {
  return (
    <Section>
      <Container>
        {richText && <RichText className="mb-6" data={richText} enableGutter={false} />}
        {Array.isArray(links) && links.length > 0 && (
          <ul className="flex md:justify-center gap-4">
            {links.map(({ link }, i) => (
              <li key={i}>
                <CMSLink {...link} />
              </li>
            ))}
          </ul>
        )}
        {media && typeof media === 'object' && <Media priority resource={media} />}
      </Container>
    </Section>
  )
}
