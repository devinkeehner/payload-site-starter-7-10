import { describe, expect, it } from 'vitest'

import type {
  EmailWorkflowPhase,
  EmailWorkflowResponse,
} from '@/lib/email/workflowTypes'

import {
  getCampaignStage,
  getCampaignStageState,
} from './campaignStages'

function createWorkflow(
  steps: EmailWorkflowResponse['steps'],
): EmailWorkflowResponse {
  return {
    audience: null,
    availableActions: [],
    delivery: {
      confirmedAt: null,
      error: null,
      jobId: null,
      mode: 'none',
      requiresScheduleConfirmation: false,
      scheduledAt: null,
      timeZone: null,
    },
    email: {
      contentRevision: 'revision',
      id: 'email-id',
      preheader: '',
      readOnly: false,
      recipientEmail: '',
      relatedPost: null,
      replyTo: '',
      scheduledAt: null,
      status: 'draft',
      subject: 'Subject',
      tenantId: 'tenant-id',
      title: 'Campaign',
    },
    phase: 'review',
    readiness: {
      canSend: false,
      contentRevision: 'revision',
      failures: 1,
      items: [],
      warnings: 0,
    },
    steps,
    test: {
      contentRevision: null,
      message: null,
      recipientEmail: null,
      sentAt: null,
      state: 'never',
    },
  }
}

function createSteps(
  overrides: Partial<EmailWorkflowResponse['steps']> = {},
): EmailWorkflowResponse['steps'] {
  const phases: EmailWorkflowPhase[] = ['compose', 'audience', 'review', 'delivery', 'results']
  return Object.fromEntries(phases.map((phase) => [
    phase,
    overrides[phase] || { available: false, complete: false },
  ])) as EmailWorkflowResponse['steps']
}

describe('campaign stage navigation', () => {
  it('uses typed backend completion instead of route position', () => {
    const workflow = createWorkflow(createSteps({
      audience: { available: true, complete: false },
      compose: { available: true, complete: false },
    }))

    expect(getCampaignStageState({
      activeStage: 'review',
      stage: getCampaignStage('compose'),
      workflow,
    })).toBe('available')
  })

  it('renders completed and unavailable steps from the workflow contract', () => {
    const workflow = createWorkflow(createSteps({
      audience: { available: true, complete: true },
      compose: { available: true, complete: true },
      delivery: {
        available: false,
        complete: false,
        reason: 'Test the current revision first.',
      },
      review: { available: true, complete: false },
    }))

    expect(getCampaignStageState({
      activeStage: 'review',
      stage: getCampaignStage('audience'),
      workflow,
    })).toBe('complete')
    expect(getCampaignStageState({
      activeStage: 'review',
      stage: getCampaignStage('delivery'),
      workflow,
    })).toBe('locked')
  })

  it('always identifies the current route as the active step', () => {
    const workflow = createWorkflow(createSteps({
      review: { available: true, complete: true },
    }))

    expect(getCampaignStageState({
      activeStage: 'review',
      stage: getCampaignStage('review'),
      workflow,
    })).toBe('active')
  })
})
