import { Section, Container } from '@/components/layout'
import type { SiteSeo } from '@/payload-types'

export function SiteSEOInfo({ seo }: { seo: SiteSeo }) {
  if (!seo) return null

  return (
    <Section>
      <Container>
        <div className="prose dark:prose-invert">
          <h2>{seo.title}</h2>
          <p>{seo.description}</p>
          {seo.tags && seo.tags.length > 0 && (
            <p>
              <strong>Tags:</strong> {seo.tags.map((t) => t.tag).join(', ')}
            </p>
          )}
          {typeof seo.metaImage === 'object' && seo.metaImage?.url && (
            <img src={seo.metaImage.url} alt={seo.title} />
          )}
        </div>
      </Container>
    </Section>
  )
}
