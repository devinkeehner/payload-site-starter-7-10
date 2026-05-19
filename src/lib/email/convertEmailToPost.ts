type EmailBlock = Record<string, unknown> & {
  blockType?: string
  id?: string | null
}

type LexicalNode = Record<string, unknown>

type LexicalState = {
  root: {
    type: string
    children: LexicalNode[]
    direction: 'ltr' | 'rtl' | null
    format: 'left' | 'start' | 'center' | 'right' | 'end' | 'justify' | ''
    indent: number
    version: number
  }
}

export type ConvertedEmailPost = {
  content: LexicalState
  layout: Array<Record<string, unknown>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : []
}

function getUploadId(value: unknown): unknown {
  if (!isRecord(value)) return value
  return value.id ?? value.value ?? value
}

function paragraph(children: LexicalNode[]): LexicalNode {
  return {
    type: 'paragraph',
    children,
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  }
}

function heading(text: string, tag = 'h2'): LexicalNode {
  return {
    type: 'heading',
    children: [textNode(text)],
    direction: null,
    format: '',
    indent: 0,
    tag,
    version: 1,
  }
}

function textNode(text: string, format = 0): LexicalNode {
  return {
    type: 'text',
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    version: 1,
  }
}

function linkNode(text: string, url: string): LexicalNode {
  return {
    type: 'link',
    children: [textNode(text)],
    direction: null,
    fields: {
      doc: null,
      linkType: 'custom',
      newTab: false,
      url,
    },
    format: '',
    indent: 0,
    version: 3,
  }
}

function richText(children: LexicalNode[]): LexicalState {
  return {
    root: {
      type: 'root',
      children: children.length ? children : [paragraph([textNode('')])],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

function textRichText(text: string): LexicalState {
  return richText([paragraph([textNode(text)])])
}

function isLexicalState(value: unknown): value is LexicalState {
  return Boolean(isRecord(value) && isRecord(value.root) && Array.isArray(value.root.children))
}

function normalizeRichText(value: unknown, fallback = ''): LexicalState {
  if (isLexicalState(value)) return value
  return textRichText(fallback)
}

function firstTextFromLexical(value: unknown): string {
  const parts: string[] = []

  function walk(node: unknown) {
    if (!isRecord(node)) return
    if (typeof node.text === 'string') {
      parts.push(node.text)
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(walk)
    }
  }

  walk(value)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function lexicalChildrenFromText(text: string): LexicalNode[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => paragraph([textNode(part)]))
}

function getPostBlockText(block: Record<string, unknown>): string {
  const contentText = firstTextFromLexical(block.content)
  const parts = [
    getString(block.heading),
    getString(block.title),
    contentText,
    getString(block.body),
    getString(block.label),
    getString(block.url),
  ].filter(Boolean)

  const nestedItems = getItems(block.items)
    .map((item) => [getString(item.title), getString(item.heading), getString(item.body), getString(item.caption)].filter(Boolean).join('\n'))
    .filter(Boolean)

  const nestedLinks = getItems(block.links)
    .map((link) => [getString(link.label), getString(link.url)].filter(Boolean).join(' '))
    .filter(Boolean)

  return [...parts, ...nestedItems, ...nestedLinks].join('\n').trim()
}

function getTextAlignment(value: unknown): 'left' | 'center' | 'right' {
  return value === 'center' || value === 'right' ? value : 'left'
}

function getButtonVariant(value: unknown): 'primary' | 'secondary' | 'outline' {
  return value === 'outline' ? 'outline' : value === 'accent' ? 'secondary' : 'primary'
}

function getCalloutTone(value: unknown): 'note' | 'accent' | 'strong' {
  if (value === 'primary') return 'strong'
  if (value === 'accent') return 'accent'
  return 'note'
}

function getPostHeadingTag(value: unknown): string {
  return value === 'h3' || value === 'h4' ? value : 'h2'
}

function postRichText(content: LexicalState): Record<string, unknown> {
  return {
    blockType: 'postRichText',
    content,
  }
}

function postButton(label: string, url: string, variant: unknown, align: unknown): Record<string, unknown> | null {
  if (!label || !url) return null
  return {
    blockType: 'postButton',
    align: getTextAlignment(align),
    label,
    url,
    variant: getButtonVariant(variant),
  }
}

function postImage(media: unknown, caption?: string): Record<string, unknown> | null {
  if (!media) return null
  return {
    blockType: 'postImage',
    caption: caption || undefined,
    media: getUploadId(media),
  }
}

function postGallery(items: Record<string, unknown>[], layout: unknown): Record<string, unknown> | null {
  const galleryItems = items
    .map((item) => ({
      caption: getString(item.caption) || undefined,
      media: item.media ? getUploadId(item.media) : null,
    }))
    .filter((item) => item.media)

  if (!galleryItems.length) return null

  return {
    blockType: 'postGallery',
    items: galleryItems,
    layout: layout === 'verticalGrid' ? 'stacked' : 'grid',
  }
}

function postList(items: Record<string, unknown>[], style: unknown): Record<string, unknown> | null {
  const listItems = items
    .map((item) => ({
      body: getString(item.body) || undefined,
      media: item.media ? getUploadId(item.media) : undefined,
      title: getString(item.title),
    }))
    .filter((item) => item.title || item.body || item.media)

  if (!listItems.length) return null

  return {
    blockType: 'postList',
    items: listItems,
    style: style === 'imageLeft' ? 'imageLeft' : 'simple',
  }
}

function postLinks(
  headingText: string,
  bodyText: string,
  links: Record<string, unknown>[],
): Record<string, unknown> | null {
  const convertedLinks = links
    .map((link) => ({
      label: getString(link.label) || getString(link.platform),
      url: getString(link.url),
    }))
    .filter((link) => link.label && link.url)

  if (!headingText && !bodyText && !convertedLinks.length) return null

  return {
    blockType: 'postLinks',
    body: bodyText || undefined,
    heading: headingText || undefined,
    links: convertedLinks,
  }
}

function convertInlineLink(block: EmailBlock): Record<string, unknown> | null {
  const beforeText = getString(block.beforeText)
  const label = getString(block.label)
  const url = getString(block.url)
  const afterText = getString(block.afterText)
  if (!label || !url) return null

  const children: LexicalNode[] = []
  if (beforeText) children.push(textNode(/\s$/.test(beforeText) ? beforeText : `${beforeText} `))
  children.push(linkNode(label, url))
  if (afterText) children.push(textNode(/^\s|^[.,;:!?]/.test(afterText) ? afterText : ` ${afterText}`))

  return postRichText(richText([paragraph(children)]))
}

function textSection(headingText: string, bodyText?: string): Record<string, unknown> | null {
  const blocks: LexicalNode[] = []
  if (headingText) blocks.push(heading(headingText))
  if (bodyText) blocks.push(paragraph([textNode(bodyText)]))
  return blocks.length ? postRichText(richText(blocks)) : null
}

function convertEmailBlock(block: EmailBlock): Array<Record<string, unknown>> {
  switch (block.blockType) {
    case 'emailHeading': {
      const text = getString(block.text)
      return text ? [postRichText(richText([heading(text, getPostHeadingTag(block.level))]))] : []
    }
    case 'emailText':
      return [postRichText(normalizeRichText(block.text))]
    case 'emailInlineLink': {
      const converted = convertInlineLink(block)
      return converted ? [converted] : []
    }
    case 'emailButton': {
      const converted = postButton(getString(block.label), getString(block.url), block.variant, block.align)
      return converted ? [converted] : []
    }
    case 'emailTwoButtons':
      return [
        postButton(getString(block.primaryLabel), getString(block.primaryUrl), block.primaryVariant, block.align),
        postButton(getString(block.secondaryLabel), getString(block.secondaryUrl), block.secondaryVariant, block.align),
      ].filter((item): item is Record<string, unknown> => Boolean(item))
    case 'emailImage': {
      const converted = postImage(block.media)
      return converted ? [converted] : []
    }
    case 'emailGallery':
      return [postGallery(getItems(block.items), block.layout)]
        .filter((item): item is Record<string, unknown> => Boolean(item))
    case 'emailList':
      return [postList(getItems(block.items), block.style)]
        .filter((item): item is Record<string, unknown> => Boolean(item))
    case 'emailMarkdown': {
      const markdown = getString(block.markdown)
      return markdown ? [postRichText(textRichText(markdown))] : []
    }
    case 'emailDivider':
      return [{ blockType: 'postDivider' }]
    case 'emailCallout':
      return [{
        blockType: 'postCallout',
        content: textRichText(getString(block.body)),
        heading: getString(block.heading),
        tone: getCalloutTone(block.variant),
      }]
    case 'emailArticleImageRight': {
      const blocks: Array<Record<string, unknown>> = []
      const image = postImage(block.media)
      const text = textSection(getString(block.heading), getString(block.body))
      if (image) blocks.push(image)
      if (text) blocks.push(text)
      const button = postButton(getString(block.linkLabel), getString(block.url), 'outline', 'left')
      if (button) blocks.push(button)
      return blocks
    }
    case 'emailArticleTwoCards':
      return getItems(block.cards).flatMap((card) => {
        const blocks: Array<Record<string, unknown>> = []
        const image = postImage(card.media)
        const text = textSection(getString(card.heading), getString(card.body))
        const button = postButton(getString(card.linkLabel), getString(card.url), 'outline', 'left')
        if (image) blocks.push(image)
        if (text) blocks.push(text)
        if (button) blocks.push(button)
        return blocks
      })
    case 'emailFeatureThreeCentered': {
      const blocks: LexicalNode[] = []
      const headingText = getString(block.heading)
      if (headingText) blocks.push(heading(headingText))
      getItems(block.paragraphs).forEach((item) => {
        const text = getString(item.text)
        if (text) blocks.push(paragraph([textNode(text)]))
      })
      return blocks.length ? [postRichText(richText(blocks))] : []
    }
    case 'emailBentoGrid': {
      const blocks: Array<Record<string, unknown>> = []
      const headingText = getString(block.heading)
      if (headingText) blocks.push(postRichText(richText([heading(headingText)])))
      getItems(block.items).forEach((item) => {
        const image = postImage(item.media)
        const text = textSection(getString(item.title), getString(item.body))
        if (image) blocks.push(image)
        if (text) blocks.push(text)
      })
      return blocks
    }
    case 'emailGrid':
      return [
        ...convertEmailLayout(block.leftBlocks),
        ...convertEmailLayout(block.centerBlocks),
        ...convertEmailLayout(block.rightBlocks),
      ]
    case 'emailSpacer':
      return [{
        blockType: 'postSpacer',
        size: typeof block.size === 'number' ? block.size : 24,
      }]
    case 'emailHeaderSocial': {
      const links = getItems(block.socialLinks).map((link) => ({
        label: getString(link.platform),
        url: getString(link.url),
      }))
      const converted = postLinks(getString(block.logoText), getString(block.subtitle), links)
      return converted ? [converted] : []
    }
    case 'emailFooterOneColumn':
      return [
        postLinks(
          getString(block.heading),
          [getString(block.body), getString(block.address), getString(block.copyright)].filter(Boolean).join('\n\n'),
          getItems(block.links),
        ),
      ].filter((item): item is Record<string, unknown> => Boolean(item))
    default:
      return []
  }
}

function convertEmailLayout(layout: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(layout)) return []
  return layout
    .filter((block): block is EmailBlock => isRecord(block) && typeof block.blockType === 'string')
    .flatMap(convertEmailBlock)
}

export function convertEmailToPost(layout: unknown, fallbackContent: string): ConvertedEmailPost {
  const convertedLayout = convertEmailLayout(layout)
  const contentChildren = convertedLayout
    .map(getPostBlockText)
    .filter(Boolean)
    .flatMap(lexicalChildrenFromText)

  return {
    content: richText(contentChildren.length ? contentChildren : [paragraph([textNode(fallbackContent || 'Draft post content.')])]),
    layout: convertedLayout.length ? convertedLayout : [{ blockType: 'postBody' }],
  }
}
