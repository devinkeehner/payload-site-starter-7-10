import type {
  EmailWorkflowPhase,
  EmailWorkflowResponse,
} from '@/lib/email/workflowTypes'

export type CampaignStageDefinition = {
  description: string
  label: string
  phase: EmailWorkflowPhase
  route: string
}

export type CampaignStageState = 'active' | 'available' | 'complete' | 'locked'

export const CAMPAIGN_STAGES: CampaignStageDefinition[] = [
  {
    description: 'Write and design',
    label: 'Compose',
    phase: 'compose',
    route: 'visual',
  },
  {
    description: 'Choose recipients',
    label: 'Audience',
    phase: 'audience',
    route: 'audience',
  },
  {
    description: 'Preview and test',
    label: 'Review & Test',
    phase: 'review',
    route: 'review',
  },
  {
    description: 'Send or schedule',
    label: 'Delivery',
    phase: 'delivery',
    route: 'delivery',
  },
  {
    description: 'Track performance',
    label: 'Results',
    phase: 'results',
    route: 'results',
  },
]

export function getCampaignStage(
  phase: EmailWorkflowPhase,
): CampaignStageDefinition {
  return CAMPAIGN_STAGES.find((stage) => stage.phase === phase) || CAMPAIGN_STAGES[0]!
}

export function getCampaignStageState({
  activeStage,
  stage,
  workflow,
}: {
  activeStage: EmailWorkflowPhase
  stage: CampaignStageDefinition
  workflow: EmailWorkflowResponse | null
}): CampaignStageState {
  if (stage.phase === activeStage) return 'active'
  if (!workflow) return 'locked'

  const step = workflow.steps[stage.phase]
  if (step.complete) return 'complete'
  return step.available ? 'available' : 'locked'
}
