type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === 'object' && value !== null ? (value as UnknownRecord) : {}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

export const SEO_ASSISTANT_MODEL_OPTIONS = [
  { label: 'GPT-5.6 Luna', value: 'gpt-5.6-luna' },
  { label: 'GPT-5.4', value: 'gpt-5.4' },
  { label: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
] as const

export const SEO_ASSISTANT_REASONING_OPTIONS = [
  { label: 'Minimal', value: 'minimal' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
] as const

export const SEO_ASSISTANT_TONE_OPTIONS = [
  { label: 'Neutral', value: 'neutral' },
  { label: 'Lean Right', value: 'lean-right' },
  { label: 'Strong Right', value: 'strong-right' },
] as const

export type SeoAssistantModel = (typeof SEO_ASSISTANT_MODEL_OPTIONS)[number]['value']
export type SeoAssistantReasoning = (typeof SEO_ASSISTANT_REASONING_OPTIONS)[number]['value']
export type SeoAssistantTone = (typeof SEO_ASSISTANT_TONE_OPTIONS)[number]['value']

export type SeoAssistantSettings = {
  defaultInstructions: string
  defaultModel: SeoAssistantModel
  defaultReasoning: SeoAssistantReasoning
  defaultTone: SeoAssistantTone
}

export const DEFAULT_SEO_ASSISTANT_SETTINGS: SeoAssistantSettings = {
  defaultInstructions: '',
  defaultModel: 'gpt-5.6-luna',
  defaultReasoning: 'medium',
  defaultTone: 'lean-right',
}

const modelValues = new Set<SeoAssistantModel>(
  SEO_ASSISTANT_MODEL_OPTIONS.map((option) => option.value),
)

const reasoningValues = new Set<SeoAssistantReasoning>(
  SEO_ASSISTANT_REASONING_OPTIONS.map((option) => option.value),
)

const toneValues = new Set<SeoAssistantTone>(SEO_ASSISTANT_TONE_OPTIONS.map((option) => option.value))

export const normalizeSeoAssistantSettings = (value: unknown): SeoAssistantSettings => {
  const record = asRecord(value)
  const defaultModelValue = getString(record.defaultModel)?.trim()
  const defaultReasoningValue = getString(record.defaultReasoning)
  const defaultToneValue = getString(record.defaultTone)
  const defaultInstructions = getString(record.defaultInstructions)?.trim() || ''
  const hasSupportedModel = modelValues.has(defaultModelValue as SeoAssistantModel)

  return {
    defaultInstructions,
    defaultModel: hasSupportedModel
      ? (defaultModelValue as SeoAssistantModel)
      : DEFAULT_SEO_ASSISTANT_SETTINGS.defaultModel,
    // The retired Nano/low default and invalid saved models move as a unit to
    // the benchmark-selected Luna/medium default.
    defaultReasoning: hasSupportedModel && reasoningValues.has(defaultReasoningValue as SeoAssistantReasoning)
      ? (defaultReasoningValue as SeoAssistantReasoning)
      : DEFAULT_SEO_ASSISTANT_SETTINGS.defaultReasoning,
    defaultTone: toneValues.has(defaultToneValue as SeoAssistantTone)
      ? (defaultToneValue as SeoAssistantTone)
      : DEFAULT_SEO_ASSISTANT_SETTINGS.defaultTone,
  }
}
