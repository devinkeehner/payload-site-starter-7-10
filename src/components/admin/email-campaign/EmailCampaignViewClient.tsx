'use client'

import { useConfig } from '@payloadcms/ui'
import React, { useEffect } from 'react'

import {
  EmailCampaignShell,
  getCampaignStageURL,
} from '@/components/admin/email-workflow/EmailCampaignShell'
import { useEmailWorkflow } from '@/components/admin/email-workflow/useEmailWorkflow'

export function EmailCampaignViewClient({
  emailId,
  title,
}: {
  emailId: string
  title: string
}) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const { error, isLoading, workflow } = useEmailWorkflow(emailId)

  useEffect(() => {
    if (!workflow) return

    window.location.replace(getCampaignStageURL({
      adminRoute,
      emailId,
      phase: workflow.phase,
    }))
  }, [adminRoute, emailId, workflow])

  return (
    <EmailCampaignShell
      activeStage={workflow?.phase || 'compose'}
      description="Opening the next incomplete step in this campaign."
      emailId={emailId}
      error={error}
      isLoading={isLoading}
      title={title}
      workflow={workflow}
    >
      <div aria-live="polite" className="email-campaign__loading">
        <span aria-hidden="true" />
        Opening campaign workspace…
      </div>
    </EmailCampaignShell>
  )
}
