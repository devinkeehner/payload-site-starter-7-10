import OpenAI from 'openai'
import { z } from 'zod'

import {
  type SeoAssistantSettings,
  type SeoAssistantTone,
  normalizeSeoAssistantSettings,
} from '@/lib/seo/assistantConfig'

type SeoTaxonomyOption = {
  id?: string
  slug?: string
  title?: string
}

type GeneratedPostSeo = {
  articleType: string
  categories: string[]
  description: string
  keyTakeaways: string[]
  metaTitle: string
  model: string
  reasoning: SeoAssistantSettings['defaultReasoning']
  tone: SeoAssistantTone
}

type OpenAIMetadata = Record<string, string>

const postSeoResponseSchema = z.object({
  articleType: z.string().min(1),
  categories: z.array(z.string().min(1)).length(1),
  description: z.string().min(1),
  keyTakeaways: z.array(z.string().min(1)).length(4),
  metaTitle: z.string().min(1),
})

const postSeoResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    metaTitle: { type: 'string' },
    description: { type: 'string' },
    keyTakeaways: {
      type: 'array',
      items: { type: 'string' },
      minItems: 4,
      maxItems: 4,
    },
    categories: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 1,
    },
    articleType: { type: 'string' },
  },
  required: ['metaTitle', 'description', 'keyTakeaways', 'categories', 'articleType'],
} satisfies Record<string, unknown>

const htmlEntityMap: Record<string, string> = {
  '&amp;': '&',
  '&#38;': '&',
  '&apos;': "'",
  '&#39;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&nbsp;': ' ',
  '&#160;': ' ',
  '&quot;': '"',
  '&#34;': '"',
}

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&(amp|apos|gt|lt|nbsp|quot);|&#(34|38|39|160);/g, (match) => htmlEntityMap[match] || match)
    .replace(/&#(\d+);/g, (_match, codePoint) => {
      const parsed = Number.parseInt(String(codePoint), 10)
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : ''
    })

export const htmlToPlainText = (value: string) => {
  if (!value) return ''

  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  )
}

const normalizeInlineText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()

const normalizeTakeaway = (value: string) =>
  normalizeInlineText(value)
    .replace(/[.;:!?]+$/g, '')
    .trim()

const buildToneInstruction = (tone: SeoAssistantTone) => {
  switch (tone) {
    case 'neutral':
      return 'Write in a neutral, mainstream policy-news voice. Prioritize clarity, precision, and search readability over partisan contrast. Do not add conservative framing unless the article itself uses it explicitly.'
    case 'strong-right':
      return 'Write in a clearly conservative political voice. Use sharper contrast with Democrats or progressive policy when supported by the article, but do not exaggerate, speculate, or invent attacks.'
    case 'lean-right':
    default:
      return 'Write in a disciplined right-of-center political voice. Emphasize taxpayer impact, affordability, accountability, parental rights, public safety, or government overreach when supported by the article. Avoid canned slogans and overheated rhetoric.'
  }
}

const buildInstructions = () =>
  [
    'Generate structured SEO metadata for the provided political article.',
    'Return only JSON matching the required schema.',
    'Honor instruction priority in this order: 1) schema, 2) one-off editor instructions, 3) selected tone, 4) article text, 5) saved default instructions.',
    'Focus on the article subject and policy substance, not on the act of reporting.',
    'Use plain, active language and clean headline writing.',
    'Treat one-off editor instructions as trusted author input. They may intentionally add or override facts, emphasis, or framing that are not spelled out in the article text.',
    'Do not invent details, numbers, people, motives, or outcomes unless they are stated in the article text or explicitly supplied in one-off editor instructions.',
    'Meta title: one concise, click-worthy SEO headline centered on the main proposal or news hook. Avoid stacked clauses and generic phrasing.',
    'Description: exactly one sentence summarizing the central development or proposal with high information density and no filler.',
    'Key takeaways: exactly four lines, each under 20 words, written like political headline fragments. Start with strong subjects or verbs. No meta phrasing.',
    'Categories: choose exactly one best-fit category slug from the provided list. Return the slug only.',
    'Article type: choose exactly one best-fit article type slug from the provided list. Return the slug only.',
    'If the article is an announcement of a proposal, rollout, endorsement, or legislative push, prefer `announcement` over `news` unless the article is clearly reported as straight news.',
    'If one-off editor instructions ask for a specific fact or point to be included, include it when possible while still satisfying the schema.',
  ].join('\n')

const buildUserInput = (args: {
  additionalInstructions?: string
  articleText: string
  articleTitle: string
  articleTypesList: string
  categoriesList: string
  settings: SeoAssistantSettings
  tone: SeoAssistantTone
}) => {
  const sections = [
    args.additionalInstructions
      ? `One-off editor instructions (highest priority after schema):\n${args.additionalInstructions}`
      : null,
    `Selected tone:\n${buildToneInstruction(args.tone)}`,
    args.settings.defaultInstructions
      ? `Saved default instructions:\n${args.settings.defaultInstructions}`
      : null,
    `Available categories (return exactly one slug):\n${args.categoriesList}`,
    `Available article types (return exactly one slug):\n${args.articleTypesList}`,
    `Article title:\n${args.articleTitle}`,
    `Article text:\n${args.articleText}`,
  ]

  return sections.filter(Boolean).join('\n\n')
}

export const generatePostSeo = async (args: {
  additionalInstructions?: string
  apiKey: string
  articleTypeOptions: SeoTaxonomyOption[]
  categoryOptions: SeoTaxonomyOption[]
  contentHtml: string
  metadata?: OpenAIMetadata
  safetyIdentifier?: string
  settings?: unknown
  title: string
  tone?: SeoAssistantTone
}): Promise<GeneratedPostSeo> => {
  const settings = normalizeSeoAssistantSettings(args.settings)
  const tone = args.tone || settings.defaultTone
  const categoriesList = args.categoryOptions
    .map((option) => `${option.slug || ''} | ${option.title || ''}`.trim())
    .join('\n')
  const articleTypesList = args.articleTypeOptions
    .map((option) => `${option.slug || ''} | ${option.title || ''}`.trim())
    .join('\n')
  const articleText = htmlToPlainText(args.contentHtml).slice(0, 16000)

  if (!articleText || articleText.length < 40) {
    throw new Error('Not enough post content to generate SEO metadata.')
  }

  const client = new OpenAI({ apiKey: args.apiKey })
  const response = await client.responses.create({
    model: settings.defaultModel,
    metadata: args.metadata,
    reasoning: { effort: settings.defaultReasoning },
    safety_identifier: args.safetyIdentifier,
    instructions: buildInstructions(),
    input: buildUserInput({
      additionalInstructions: args.additionalInstructions?.trim(),
      articleText,
      articleTitle: normalizeInlineText(args.title),
      articleTypesList,
      categoriesList,
      settings,
      tone,
    }),
    max_output_tokens: 900,
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: 'post_seo_metadata',
        strict: true,
        schema: postSeoResponseJsonSchema,
      },
    },
  })

  const parsed = postSeoResponseSchema.parse(JSON.parse(response.output_text || '{}'))

  return {
    articleType: normalizeInlineText(parsed.articleType),
    categories: parsed.categories.map((value) => normalizeInlineText(value)),
    description: normalizeInlineText(parsed.description),
    keyTakeaways: parsed.keyTakeaways.map((value) => normalizeTakeaway(value)),
    metaTitle: normalizeInlineText(parsed.metaTitle),
    model: settings.defaultModel,
    reasoning: settings.defaultReasoning,
    tone,
  }
}
