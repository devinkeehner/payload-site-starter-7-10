import {
  AlignCenter, AlignLeft, CodeXml, Columns2, GalleryHorizontal, Grid2X2, Heading, Image,
  LayoutDashboard, LayoutTemplate, Link2, List, MessageSquareQuote, Minus, MousePointerClick,
  Newspaper, PanelBottom, PanelTop, PlaySquare, UnfoldVertical, type LucideIcon,
} from 'lucide-react'
import type { PuckBlockSchema } from '@/lib/puck/types'

type Group = {
  label: string
  tab: 'Content' | 'Media' | 'Layout'
  tiles: [slug: string, label: string, icon: LucideIcon][]
}

const groups: Group[] = [
  { label: 'Text & content', tab: 'Content', tiles: [
    ['emailText', 'Text', AlignLeft], ['emailHeading', 'Heading', Heading],
    ['emailList', 'List', List], ['emailCallout', 'Callout', MessageSquareQuote],
    ['emailMarkdown', 'Markdown', CodeXml],
  ] },
  { label: 'Images & video', tab: 'Media', tiles: [
    ['emailImage', 'Image', Image], ['emailGallery', 'Gallery', Grid2X2],
    ['emailVideo', 'Video', PlaySquare],
  ] },
  { label: 'Buttons & links', tab: 'Content', tiles: [
    ['emailButton', 'Button', MousePointerClick], ['emailTwoButtons', 'Two buttons', Columns2],
    ['emailInlineLink', 'Link', Link2],
  ] },
  { label: 'Articles & features', tab: 'Layout', tiles: [
    ['emailArticleImageRight', 'Article', Newspaper], ['emailArticleTwoCards', 'Article cards', GalleryHorizontal],
    ['emailFeatureThreeCentered', 'Feature', AlignCenter], ['emailBentoGrid', 'Bento grid', LayoutDashboard],
  ] },
  { label: 'Spacing', tab: 'Layout', tiles: [
    ['emailDivider', 'Divider', Minus], ['emailSpacer', 'Spacer', UnfoldVertical],
  ] },
  { label: 'Header / Footer', tab: 'Layout', tiles: [
    ['emailHeaderSocial', 'Header', PanelTop], ['emailFooterOneColumn', 'Footer', PanelBottom],
  ] },
]

export function getEmailPaletteGroups(schemas: readonly PuckBlockSchema[]) {
  const available = new Map(schemas.map(schema => [schema.slug, schema]))
  available.delete('emailGrid') // The Rows drawer owns the row presets.
  const result = groups.map(({ label, tab, tiles }) => ({
    label, tab,
    blocks: tiles.flatMap(([slug, label, Icon]) => {
      const schema = available.get(slug)
      if (!schema) return []
      available.delete(slug)
      return [{ schema, label, Icon }]
    }),
  }))
  if (available.size) {
    result.splice(-1, 0, {
      label: 'Other content', tab: 'Content',
      blocks: Array.from(available.values(), schema => ({ schema, label: schema.label, Icon: LayoutTemplate })),
    })
  }
  return result
}
