import type { CSSProperties, ReactNode } from 'react'
import { safeSectionURL } from '@/lib/live-editor/pageSections'
import styles from './section.module.css'
import { SectionIcon } from './SectionIcon'
import { sectionMediaURL, sectionYouTubeEmbed } from './media'

type Block = Record<string, unknown>
const asText = (value: unknown) => typeof value === 'string' ? value : ''

function resource(value: unknown) {
  const object = value && typeof value === 'object' ? value as Block : {}
  return { url: sectionMediaURL(object.url), alt: asText(object.alt) }
}

export function SectionElement({ block, children, resolveMedia = value => value, text = name => asText(block[name]), richText, form, editing = false }: {
  block: Block
  children?: ReactNode
  resolveMedia?: (value: unknown) => unknown
  text?: (name: string) => ReactNode
  richText?: ReactNode
  form?: ReactNode
  editing?: boolean
}) {
  const caption = asText(block.caption)
  const columnCount = Array.isArray(block.children) ? Math.max(1, Math.min(4, block.children.length)) : 1
  const placeholder = (label: string) => editing ? <span className={styles.placeholder}>{label}</span> : null
  switch (block.blockType) {
    case 'composableSection':
      return <section className={styles.section} data-designed-section={block.design != null || undefined} data-tone={asText(block.tone)}>{children}</section>
    case 'sectionColumns':
    case 'sectionGrid':
      return <div className={styles.grid} data-variant={asText(block.variant)} style={{ '--section-columns': columnCount } as CSSProperties}>{children}</div>
    case 'sectionStack':
    case 'sectionColumn':
      return <div className={styles.stack}>{children}</div>
    case 'sectionCard':
      return <div className={styles.card}>{children}</div>
    case 'sectionHeading': {
      const Heading = block.level === 'h3' || block.level === 'h4' ? block.level : 'h2'
      return <Heading className={styles.heading}>{text('text')}</Heading>
    }
    case 'sectionText':
      return <div className={styles.copy}>{richText}</div>
    case 'sectionCallout':
      return <aside className={styles.callout}><strong>{text('text')}</strong><div className={styles.copy}>{richText}</div></aside>
    case 'sectionStatistic':
      return <div className={styles.stat}><strong>{text('value')}</strong><span>{text('text')}</span></div>
    case 'sectionQuote':
      return <figure className={styles.quote}><blockquote>{text('text')}</blockquote>{block.attribution ? <figcaption>{asText(block.attribution)}</figcaption> : null}</figure>
    case 'sectionList':
      return <ul className={styles.list}>{asText(block.text).split('\n').filter(line => line.trim()).map((line, index) => <li key={index}>{line}</li>)}</ul>
    case 'sectionImage': {
      const image = resource(resolveMedia(block.image))
      return image.url ? <figure className={styles.figure}><img src={image.url} alt={image.alt} loading="lazy" />{caption && <figcaption>{caption}</figcaption>}</figure> : placeholder('Choose an image')
    }
    case 'sectionGallery':
      return <div className={styles.gallery}>{Array.isArray(block.images) && block.images.length ? block.images.map((entry, index) => {
        const image = resource(resolveMedia(entry))
        return image.url ? <img key={index} src={image.url} alt={image.alt} loading="lazy" /> : null
      }) : placeholder('Choose gallery images')}</div>
    case 'sectionVideo': {
      const embed = sectionYouTubeEmbed(block.youtubeUrl)
      const video = resource(resolveMedia(block.file))
      if (!embed && !video.url) return placeholder('Choose a video or enter a YouTube URL')
      return <figure className={styles.figure}>
        {embed
          ? <iframe className={styles.videoEmbed} src={embed} title={caption || 'YouTube video'} loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          : <video src={video.url} controls preload="metadata" aria-label={caption || 'Video'} />}
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    }
    case 'sectionLink':
    case 'sectionButton':
    case 'sectionDocument': {
      const url = block.blockType === 'sectionDocument' ? resource(resolveMedia(block.file)).url : safeSectionURL(block.url)
      const className = block.blockType === 'sectionButton' ? styles.button : styles.link
      const label = text('text')
      if (editing) return <span className={className}>{label || 'Link label'}</span>
      return url ? <a className={className} href={url}>{label || (block.blockType === 'sectionDocument' ? 'Open document' : url)}</a> : null
    }
    case 'sectionIcon':
      return <span className={styles.icon}><SectionIcon symbol={block.symbol} size={block.size} color={block.color} /> {text('text')}</span>
    case 'sectionDivider':
      return <hr className={styles.divider} />
    case 'sectionForm':
      return form ? <>{form}</> : placeholder('Select a form')
    default:
      return null
  }
}
