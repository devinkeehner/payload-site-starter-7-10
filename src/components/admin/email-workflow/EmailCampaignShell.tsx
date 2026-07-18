'use client'

import { Gutter, useConfig } from '@payloadcms/ui'
import {
  ChevronDown,
  CircleAlert,
  MoreHorizontal,
} from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React, { type ReactNode, useMemo } from 'react'

import type {
  EmailCampaignStatus,
  EmailWorkflowPhase,
  EmailWorkflowResponse,
} from '@/lib/email/workflowTypes'

import {
  getCampaignStage,
} from './campaignStages'
import { EmailCampaignStageNav } from './EmailCampaignStageNav'
import './email-workflow.scss'

const STATUS_LABELS: Record<EmailCampaignStatus, string> = {
  draft: 'Draft',
  failed: 'Delivery failed',
  queued: 'Queued',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
}

export function EmailCampaignShell({
  activeStage,
  children,
  description,
  emailId,
  error,
  isLoading = false,
  title,
  workflow,
}: {
  activeStage: EmailWorkflowPhase
  children: ReactNode
  description: string
  emailId: string
  error?: string | null
  isLoading?: boolean
  title: string
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
    <Gutter className="email-campaign">
      <header className="email-campaign__header">
        <div className="email-campaign__identity">
          <div className="email-campaign__title-row">
            <h1>{title}</h1>
            {workflow ? (
              <span className="email-campaign__status" data-status={workflow.email.status}>
                {STATUS_LABELS[workflow.email.status]}
              </span>
            ) : null}
          </div>
          <p>{description}</p>
        </div>

        <details className="email-campaign__overflow">
          <summary aria-label="Campaign actions">
            <MoreHorizontal aria-hidden="true" />
            <span>More</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="email-campaign__overflow-menu">
            <a href={baseURL}>Advanced fields</a>
          </div>
        </details>
      </header>

      <EmailCampaignStageNav
        activeStage={activeStage}
        emailId={emailId}
        workflow={workflow}
      />

      {error ? (
        <div className="email-campaign__notice" data-state="error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {isLoading && !workflow ? (
        <div aria-live="polite" className="email-campaign__loading">
          <span aria-hidden="true" />
          Loading the latest campaign status…
        </div>
      ) : children}
    </Gutter>
  )
}

export function getCampaignStageURL({
  adminRoute,
  emailId,
  phase,
}: {
  adminRoute: string
  emailId: string
  phase: EmailWorkflowPhase
}) {
  const stage = getCampaignStage(phase)
  const baseURL = formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` })
  return `${baseURL}/${stage.route}`
}
