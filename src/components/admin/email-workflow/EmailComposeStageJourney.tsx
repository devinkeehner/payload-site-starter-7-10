'use client'

import React from 'react'

import { EmailCampaignStageNav } from './EmailCampaignStageNav'
import { EmailComposeMessageSettings } from './EmailComposeMessageSettings'
import './email-workflow.scss'
import { useEmailWorkflow } from './useEmailWorkflow'

export function EmailComposeStageJourney({ emailId }: { emailId: string }) {
  const { workflow } = useEmailWorkflow(emailId)

  return (
    <div className="email-compose-journey">
      <EmailCampaignStageNav
        activeStage="compose"
        emailId={emailId}
        variant="builder"
        workflow={workflow}
      />
      <EmailComposeMessageSettings emailId={emailId} workflow={workflow} />
    </div>
  )
}
