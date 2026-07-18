'use client'

import { useConfig } from '@payloadcms/ui'
import {
  Check,
  Circle,
  LockKeyhole,
} from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React, { useMemo } from 'react'

import type {
  EmailWorkflowPhase,
  EmailWorkflowResponse,
} from '@/lib/email/workflowTypes'

import {
  CAMPAIGN_STAGES,
  getCampaignStageState,
  type CampaignStageState,
} from './campaignStages'

function StageIcon({ state }: { state: CampaignStageState }) {
  if (state === 'complete') return <Check aria-hidden="true" />
  if (state === 'locked') return <LockKeyhole aria-hidden="true" />
  if (state === 'active') return <Circle aria-hidden="true" fill="currentColor" />
  return <Circle aria-hidden="true" />
}

export function EmailCampaignStageNav({
  activeStage,
  emailId,
  variant = 'page',
  workflow,
}: {
  activeStage: EmailWorkflowPhase
  emailId: string
  variant?: 'builder' | 'page'
  workflow: EmailWorkflowResponse | null
}) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const baseURL = useMemo(
    () => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }),
    [adminRoute, emailId],
  )

  return (
    <nav
      aria-label="Campaign workflow"
      className={`email-campaign__stage-nav email-campaign__stage-nav--${variant}`}
    >
      <ol>
        {CAMPAIGN_STAGES.map((stage, index) => {
          const stageState = getCampaignStageState({ activeStage, stage, workflow })
          const unavailableReason = workflow?.steps[stage.phase]?.reason
          const content = (
            <>
              <span className="email-campaign__stage-marker">
                <StageIcon state={stageState} />
                <span className="email-campaign__stage-number">{index + 1}</span>
              </span>
              <span className="email-campaign__stage-copy">
                <strong>{stage.label}</strong>
                <small>{stage.description}</small>
              </span>
            </>
          )

          return (
            <li data-state={stageState} key={stage.phase}>
              {stageState === 'locked' ? (
                <span aria-disabled="true" title={unavailableReason || 'Complete the required earlier steps first'}>
                  {content}
                </span>
              ) : (
                <a
                  aria-current={stage.phase === activeStage ? 'step' : undefined}
                  href={`${baseURL}/${stage.route}`}
                >
                  {content}
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
