import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SEO_ASSISTANT_SETTINGS,
  normalizeSeoAssistantSettings,
} from './assistantConfig'
import { buildPostSeoInstructions } from './generatePostSeo'

describe('SEO assistant defaults', () => {
  it('uses the benchmark-selected Luna model with medium reasoning', () => {
    expect(DEFAULT_SEO_ASSISTANT_SETTINGS).toMatchObject({
      defaultModel: 'gpt-5.6-luna',
      defaultReasoning: 'medium',
    })
  })

  it('migrates the retired Nano default to Luna-medium', () => {
    expect(normalizeSeoAssistantSettings({
      defaultModel: 'gpt-5.4-nano',
      defaultReasoning: 'low',
      defaultTone: 'lean-right',
    })).toMatchObject({
      defaultModel: 'gpt-5.6-luna',
      defaultReasoning: 'medium',
      defaultTone: 'lean-right',
    })
  })

  it('preserves a supported manual fallback and its reasoning setting', () => {
    expect(normalizeSeoAssistantSettings({
      defaultModel: 'gpt-5.4-mini',
      defaultReasoning: 'low',
      defaultTone: 'neutral',
    })).toMatchObject({
      defaultModel: 'gpt-5.4-mini',
      defaultReasoning: 'low',
      defaultTone: 'neutral',
    })
  })
})

describe('post SEO instructions', () => {
  const instructions = buildPostSeoInstructions({
    tone: 'lean-right',
  })

  it('contains the four benchmark-derived factual safeguards', () => {
    expect(instructions).toContain('actors, beneficiaries, locations, and joint attribution')
    expect(instructions).toContain('exact measure, purpose, and status')
    expect(instructions).toContain('certainty, attribution, and procedural status')
    expect(instructions).toContain('taxonomy only from supplied slugs')
  })

  it('keeps the compact structured-output contract', () => {
    expect(instructions).toContain('Return only JSON matching the required schema.')
    expect(instructions).toContain('write exactly four lines, each under 20 words')
    expect(instructions).not.toContain('fact ledger')
  })
})
