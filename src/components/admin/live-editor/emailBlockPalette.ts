import {
  AlignCenter, AlignLeft, AtSign, CheckSquare, ChevronDownSquare, CircleDot, CodeXml, Columns2,
  GalleryHorizontal, Globe, Grid2X2, Hash, Heading, Image, LayoutDashboard, LayoutTemplate,
  Link2, List, ListChecks, MapPin, MessageSquareQuote, Minus, MousePointerClick, Newspaper,
  PanelBottom, PanelTop, PlaySquare, UnfoldVertical, type LucideIcon,
} from 'lucide-react'
import type { PuckBlockSchema } from '@/lib/puck/types'
import type { LiveEditorKind } from './editorVariants'

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

const formGroups: Group[] = [
  { label: 'Text & numbers', tab: 'Content', tiles: [
    ['text', 'Text', Heading], ['textarea', 'Textarea', AlignLeft], ['email', 'Email', AtSign], ['number', 'Number', Hash],
  ] },
  { label: 'Choices', tab: 'Content', tiles: [
    ['select', 'Select', ChevronDownSquare], ['radio', 'Radio', CircleDot], ['checkbox', 'Checkbox', CheckSquare],
    ['checkbox-group', 'Checkboxes', ListChecks], ['state', 'State', MapPin], ['country', 'Country', Globe],
  ] },
  { label: 'Images & video', tab: 'Media', tiles: [['image-select', 'Image choice', Image], ['video-capture', 'Video capture', PlaySquare]] },
  { label: 'Instructions', tab: 'Layout', tiles: [['message', 'Message', MessageSquareQuote]] },
]

export function getEditorPaletteGroups(schemas: readonly PuckBlockSchema[], kind: LiveEditorKind) {
  const available = new Map(schemas.map(schema => [schema.slug, schema]))
  available.delete('emailGrid') // The Rows drawer owns the row presets.
  const result = (kind === 'form' ? formGroups : groups).map(({ label, tab, tiles }) => ({
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
  return result.filter(group => group.blocks.length > 0)
}
