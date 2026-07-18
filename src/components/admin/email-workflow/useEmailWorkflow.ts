'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { EmailWorkflowResponse } from '@/lib/email/workflowTypes'

type WorkflowLoadState = 'error' | 'idle' | 'loading'

const workflowRequests = new Map<string, Promise<EmailWorkflowResponse>>()

async function requestWorkflow(emailId: string, forceFresh = false): Promise<EmailWorkflowResponse> {
  if (forceFresh) workflowRequests.delete(emailId)

  let request = workflowRequests.get(emailId)
  if (!request) {
    request = fetch(`/api/emails/${encodeURIComponent(emailId)}/workflow`, {
      cache: 'no-store',
      credentials: 'include',
    }).then(async (response) => {
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Unable to load campaign workflow')
      }
      return response.json() as Promise<EmailWorkflowResponse>
    })
    workflowRequests.set(emailId, request)
  }

  try {
    return await request
  } finally {
    if (workflowRequests.get(emailId) === request) {
      workflowRequests.delete(emailId)
    }
  }
}

export function invalidateEmailWorkflow(emailId: string) {
  workflowRequests.delete(emailId)
}

export function useEmailWorkflow(emailId: string, initialWorkflow?: EmailWorkflowResponse | null) {
  const [workflow, setWorkflow] = useState<EmailWorkflowResponse | null>(initialWorkflow || null)
  const [state, setState] = useState<WorkflowLoadState>(initialWorkflow ? 'idle' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const loadVersion = useRef(0)

  const refresh = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    const version = ++loadVersion.current
    if (!quiet) setState('loading')
    setError(null)

    try {
      const nextWorkflow = await requestWorkflow(emailId, true)
      if (loadVersion.current !== version) return null
      setWorkflow(nextWorkflow)
      setState('idle')
      return nextWorkflow
    } catch (loadError) {
      if (loadVersion.current !== version) return null
      setState('error')
      setError(loadError instanceof Error ? loadError.message : 'Unable to load campaign workflow')
      return null
    }
  }, [emailId])

  useEffect(() => {
    if (initialWorkflow) return

    let active = true
    const version = ++loadVersion.current

    void requestWorkflow(emailId).then(
      (nextWorkflow) => {
        if (!active || loadVersion.current !== version) return
        setWorkflow(nextWorkflow)
        setState('idle')
      },
      (loadError: unknown) => {
        if (!active || loadVersion.current !== version) return
        setState('error')
        setError(loadError instanceof Error ? loadError.message : 'Unable to load campaign workflow')
      },
    )

    return () => {
      active = false
    }
  }, [emailId, initialWorkflow])

  return {
    error,
    isLoading: state === 'loading',
    refresh,
    setWorkflow,
    state,
    workflow,
  }
}
