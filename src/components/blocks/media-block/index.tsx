import type { StaticImageData } from 'next/image'

import { Section, Container } from '@/components/layout'

import { cn } from '@/lib/utils'
import React from 'react'
import RichText from '@/components/site/rich-text'

import type { MediaBlock as MediaBlockProps } from '@/payload-types'

import { Media } from '@/components/site/media'

type Props = MediaBlockProps & {
  breakout?: boolean
  captionClassName?: string
  className?: string
  enableGutter?: boolean
  imgClassName?: string
  staticImage?: StaticImageData
  disableInnerContainer?: boolean
  variant?: 'embedded' | 'standalone'
}

type MediaDisplay = {
  alignment?: 'left' | 'right'
  linkURL?: string
  width?: 'natural' | 'full' | 'half' | 'oneThird'
}

const widthClassNames: Record<NonNullable<MediaDisplay['width']>, string> = {
  natural: 'w-fit max-w-full',
  full: 'w-full',
  half: 'w-full md:w-1/2',
  oneThird: 'w-full md:w-1/3',
}

const getSafeImageLinkHref = (value: string | undefined): string | undefined => {
  const href = value?.trim()
  if (!href) return undefined
  if (href.startsWith('/') || href.startsWith('#')) return href

  try {
    const url = new URL(href)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? href : undefined
  } catch {
    return undefined
  }
}

export const MediaBlock: React.FC<Props> = (props) => {
  const {
    captionClassName,
    className,
    enableGutter: _enableGutter = true,
    imgClassName,
    media,
    staticImage,
    disableInnerContainer,
    variant = 'standalone',
  } = props
  const display = (props as Props & { display?: MediaDisplay }).display
  const linkHref = getSafeImageLinkHref(display?.linkURL)
  const alignment = display?.alignment === 'right' ? 'right' : 'left'
  const width = display?.width ?? 'natural'
  const isFractional = width === 'half' || width === 'oneThird'
  const shouldFillFrame = width !== 'natural'
  const alignmentClass =
    variant === 'embedded' && isFractional
      ? alignment === 'right'
        ? 'md:float-right md:ml-6'
        : 'md:float-left md:mr-6'
      : alignment === 'right'
        ? 'ml-auto'
        : 'mr-auto'

  let caption
  if (media && typeof media === 'object') caption = media.caption

  const image = (
    <Media
      imgClassName={cn('border', { 'w-full': shouldFillFrame }, imgClassName)}
      resource={media}
      src={staticImage}
    />
  )

  const mediaContent = linkHref ? (
    <a href={linkHref} className={shouldFillFrame ? 'block w-full' : 'block w-fit max-w-full'}>
      {image}
    </a>
  ) : (
    image
  )

  const figure = (
    <figure
      className={cn(
        { 'my-6': variant === 'embedded' },
        widthClassNames[width],
        alignmentClass,
        className,
      )}
    >
      {(media || staticImage) && mediaContent}
      {caption && (
        <div
          className={cn(
            variant === 'embedded' ? 'mt-3' : 'mt-6',
            {
              container: !disableInnerContainer && variant === 'standalone',
            },
            captionClassName,
          )}
        >
          <RichText data={caption} enableGutter={false} />
        </div>
      )}
    </figure>
  )

  if (variant === 'embedded') return figure

  return (
    <Section>
      <Container>{figure}</Container>
    </Section>
  )
}
