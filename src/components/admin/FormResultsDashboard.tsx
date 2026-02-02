'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Banner, Button, Gutter, Pill, SetStepNav, Table } from '@payloadcms/ui'
import type { ClientField } from 'payload'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

import { useActiveTenant } from './hooks/useActiveTenant'
import { formatDateTime } from '../../lib/utilities/formatDateTime'

type FormFieldOption = {
  label?: unknown
  value?: unknown
  id?: string
}

const resolveTenantID = (tenant?: unknown) => {
  if (tenant === null || tenant === undefined) return undefined
  if (typeof tenant === 'string' || typeof tenant === 'number') {
    const normalized = String(tenant).trim()
    return normalized ? normalized : undefined
  }
  if (typeof tenant === 'object') {
    const candidate = (tenant as { id?: unknown; value?: unknown; slug?: unknown; _id?: unknown }).id
      ?? (tenant as { value?: unknown }).value
      ?? (tenant as { slug?: unknown }).slug
      ?? (tenant as { _id?: unknown })._id
    return resolveTenantID(candidate)
  }
  return undefined
}

const matchesTenant = (tenantFilterID: string | undefined, tenant?: unknown) => {
  const normalizedFilter = resolveTenantID(tenantFilterID)
  if (!normalizedFilter) return true
  return resolveTenantID(tenant) === normalizedFilter
}

type FormField = {
  name?: string
  label?: unknown
  blockType?: string
  options?: FormFieldOption[]
  allowMultiple?: boolean
}

type Form = {
  id: string
  title?: string
  name?: string
  fields?: FormField[]
  tenant?: string | { id?: string } | null
}

type SubmissionField = {
  field: string
  value: unknown
}

type FormSubmission = {
  id: string
  createdAt: string
  form?: string | { id: string }
  submissionData?: SubmissionField[]
  tenant?: string | { id?: string } | null
}

type AnalyticsOption = {
  label: string
  value: string
  count: number
  percentage: number
}

type AnalyticsField = {
  name: string
  label: string
  totalResponses: number
  options: AnalyticsOption[]
}

const ANALYTICS_FIELD_TYPES = new Set(['radio', 'checkbox-group', 'image-select'])

const buildTextField = (name: string, label?: string): ClientField => ({
  name,
  label,
  type: 'text',
})

const toLabel = (value: unknown, fallback: string) => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return fallback
}

const safeParseJson = (value: string) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const normalizeSubmissionValues = (value: unknown): string[] => {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    const parsed = safeParseJson(trimmed)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item))
    if (parsed && typeof parsed === 'object') return [JSON.stringify(parsed)]
    if (trimmed.includes(',')) return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
    return [trimmed]
  }
  if (typeof value === 'object') return [JSON.stringify(value)]
  return [String(value)]
}

const formatCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  return JSON.stringify(value)
}

const collectFieldNames = (form: Form | null, formSubmissions: FormSubmission[]) => {
  const names = new Set<string>()
  form?.fields?.forEach((field) => {
    if (field.name) names.add(field.name)
  })
  formSubmissions.forEach((submission) => {
    submission.submissionData?.forEach((entry) => names.add(entry.field))
  })
  return Array.from(names)
}

const downloadCsv = (filename: string, rows: string[][]) => {
  const csvContent = rows.map((row) => row.map((cell) => `"${cell.replace(/"/gu, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

const fetchAllDocs = async (
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
) => {
  const docs: unknown[] = []
  let page = 1
  const limit = 100

  while (true) {
    const url = new URL(path, window.location.origin)
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    url.searchParams.set('page', String(page))
    url.searchParams.set('limit', String(limit))

    const response = await fetch(url.toString(), { credentials: 'include', signal })
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }
    const json = await response.json()

    docs.push(...(json.docs || []))

    if (!json.hasNextPage) break
    page = json.nextPage || page + 1
  }

  return docs
}

const getFieldDisplayName = (field: FormField) => {
  const name = field.name || ''
  return toLabel(field.label, name)
}

const getSubmissionValue = (submission: FormSubmission, fieldName: string) => {
  const entry = submission.submissionData?.find((item) => item.field === fieldName)
  return entry?.value ?? null
}

export default function FormResultsDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedFormId = searchParams?.get('formId') || ''
  const selectedTab = searchParams?.get('tab') || 'results'
  const { tenantID, tenantName } = useActiveTenant()
  const { selectedTenantID } = useTenantSelection()
  const tenantFilterID = resolveTenantID(selectedTenantID ?? tenantID)

  const [forms, setForms] = useState<Form[]>([])
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({})
  const [loadingForms, setLoadingForms] = useState(true)
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const loadForms = async () => {
      try {
        setError(null)
        setLoadingForms(true)
        const params: Record<string, string> = { depth: '0' }
        if (tenantFilterID) {
          params['where[tenant][equals]'] = tenantFilterID
        }
        const docs = await fetchAllDocs('/api/forms', params, controller.signal)
        const filtered = (docs as Form[]).filter((form) => matchesTenant(tenantFilterID, form.tenant))
        setForms(filtered)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Unable to load forms.')
        }
      } finally {
        setLoadingForms(false)
      }
    }
    void loadForms()
    return () => controller.abort()
  }, [tenantFilterID])

  useEffect(() => {
    const controller = new AbortController()
    const loadSubmissionCounts = async () => {
      try {
        setLoadingCounts(true)
        const params: Record<string, string> = { depth: '0' }
        if (tenantFilterID) {
          params['where[tenant][equals]'] = tenantFilterID
        }
        const docs = await fetchAllDocs('/api/form-submissions', params, controller.signal)
        const filtered = (docs as FormSubmission[]).filter((submission) =>
          matchesTenant(tenantFilterID, submission.tenant),
        )
        const counts: Record<string, number> = {}
        filtered.forEach((submission) => {
          const formValue = submission.form
          const formId = typeof formValue === 'string' ? formValue : formValue?.id
          if (!formId) return
          counts[formId] = (counts[formId] || 0) + 1
        })
        setSubmissionCounts(counts)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Unable to load submission counts.')
        }
      } finally {
        setLoadingCounts(false)
      }
    }

    void loadSubmissionCounts()
    return () => controller.abort()
  }, [tenantFilterID])

  useEffect(() => {
    if (!selectedFormId) {
      setSubmissions([])
      return
    }

    const controller = new AbortController()
    const loadSubmissions = async () => {
      try {
        setLoadingSubmissions(true)
        const params: Record<string, string> = {
          'where[form][equals]': selectedFormId,
        }
        if (tenantFilterID) {
          params['where[tenant][equals]'] = tenantFilterID
        }
        const docs = await fetchAllDocs('/api/form-submissions', params, controller.signal)
        const filtered = (docs as FormSubmission[]).filter((submission) =>
          matchesTenant(tenantFilterID, submission.tenant),
        )
        setSubmissions(filtered)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Unable to load submissions.')
        }
      } finally {
        setLoadingSubmissions(false)
      }
    }

    void loadSubmissions()
    return () => controller.abort()
  }, [selectedFormId, tenantFilterID])

  useEffect(() => {
    if (!selectedFormId) return
    if (loadingForms) return
    const exists = forms.some((form) => form.id === selectedFormId)
    if (!exists) {
      router.push('/admin/collections/forms')
    }
  }, [forms, loadingForms, router, selectedFormId])

  const selectedForm = useMemo(() => forms.find((form) => form.id === selectedFormId), [forms, selectedFormId])

  const fieldNames = useMemo(
    () => collectFieldNames(selectedForm || null, submissions),
    [selectedForm, submissions],
  )

  const analytics = useMemo<AnalyticsField[]>(() => {
    if (!selectedForm?.fields?.length) return []

    return selectedForm.fields
      .filter((field) => field.name && ANALYTICS_FIELD_TYPES.has(field.blockType || ''))
      .map((field) => {
        const optionMap = new Map<string, AnalyticsOption>()
        const fieldName = field.name || ''
        const totalSubmissions = submissions.length
        let totalResponses = 0

        field.options?.forEach((option) => {
          const value = option.value !== undefined ? String(option.value) : option.id || ''
          if (!value) return
          const label = toLabel(option.label, value)
          optionMap.set(value, { label, value, count: 0, percentage: 0 })
        })

        submissions.forEach((submission) => {
          const rawValue = getSubmissionValue(submission, fieldName)
          const values = normalizeSubmissionValues(rawValue)
          if (!values.length) return
          totalResponses += 1
          values.forEach((value) => {
            const entry = optionMap.get(value)
            if (entry) {
              entry.count += 1
              return
            }
            optionMap.set(value, { label: `Other: ${value}`, value, count: 1, percentage: 0 })
          })
        })

        const options = Array.from(optionMap.values())
        options.forEach((option) => {
          option.percentage = totalResponses ? Math.round((option.count / totalResponses) * 1000) / 10 : 0
        })

        const label = getFieldDisplayName(field)

        return {
          name: fieldName,
          label,
          totalResponses: totalResponses || totalSubmissions,
          options: options.sort((a, b) => b.count - a.count),
        }
      })
  }, [selectedForm?.fields, submissions])

  const handleSelectForm = useCallback(
    (formId: string, tab: string = 'results') => {
      const params = new URLSearchParams(searchParams?.toString())
      params.set('formId', formId)
      params.set('tab', tab)
      router.push(`/admin/collections/forms?${params.toString()}`)
    },
    [router, searchParams],
  )

  const handleBackToForms = useCallback(() => {
    router.push('/admin/collections/forms')
  }, [router])

  const handleEditForm = useCallback(
    (formId: string) => {
      router.push(`/admin/collections/forms/${formId}`)
    },
    [router],
  )

  const handleCreateForm = useCallback(() => {
    router.push('/admin/collections/forms/create')
  }, [router])

  const handleExportCsv = useCallback((form: Form | null, formSubmissions: FormSubmission[]) => {
    if (!form) return
    const exportFieldNames = collectFieldNames(form, formSubmissions)
    const headers = ['Submission ID', 'Submitted At', ...exportFieldNames]
    const rows: string[][] = [headers]

    formSubmissions.forEach((submission) => {
      const row = [submission.id, submission.createdAt]
      exportFieldNames.forEach((fieldName) => {
        const rawValue = getSubmissionValue(submission, fieldName)
        row.push(formatCsvValue(rawValue))
      })
      rows.push(row)
    })

    const filename = `${form.title || form.name || 'form'}-submissions.csv`
    downloadCsv(filename, rows)
  }, [])

  const handleExportCsvForForm = useCallback(
    async (form: Form) => {
      try {
        setLoadingSubmissions(true)
        const params: Record<string, string> = {
          'where[form][equals]': form.id,
        }
        if (tenantFilterID) {
          params['where[tenant][equals]'] = tenantFilterID
        }
        const docs = await fetchAllDocs('/api/form-submissions', params)
        const filtered = (docs as FormSubmission[]).filter((submission) =>
          matchesTenant(tenantFilterID, submission.tenant),
        )
        handleExportCsv(form, filtered)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to export CSV.')
      } finally {
        setLoadingSubmissions(false)
      }
    },
    [handleExportCsv, tenantFilterID],
  )

  const formRows = useMemo(() => {
    return forms.map((form) => {
      const title = form.title || form.name || 'Untitled form'
      const count = submissionCounts[form.id] || 0

      return {
        id: form.id,
        title,
        count,
      }
    })
  }, [forms, submissionCounts])

  const formColumns = useMemo(() => {
    const titleField = buildTextField('title', 'Form')
    const countField = buildTextField('count', 'Submissions')
    const actionsField = buildTextField('actions', 'Actions')
    return [
      {
        accessor: 'title',
        field: titleField,
        Heading: 'Form',
        active: true,
        renderedCells: formRows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gap: '0.25rem' }}>
            <div style={{ fontWeight: 600 }}>{row.title}</div>
            <div style={{ color: 'var(--theme-elevation-500)', fontSize: '0.85rem' }}>ID: {row.id}</div>
          </div>
        )),
      },
      {
        accessor: 'count',
        field: countField,
        Heading: 'Submissions',
        active: true,
        renderedCells: formRows.map((row) => (
          <Pill key={row.id} pillStyle="light-gray" rounded>
            {loadingCounts ? 'Loading…' : `${row.count} submissions`}
          </Pill>
        )),
      },
      {
        accessor: 'actions',
        field: actionsField,
        Heading: 'Actions',
        active: true,
        renderedCells: formRows.map((row) => (
          <div key={row.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Button buttonStyle="primary" size="small" onClick={() => handleSelectForm(row.id, 'results')}>
              View Results
            </Button>
            <Button buttonStyle="secondary" size="small" onClick={() => handleSelectForm(row.id, 'analytics')}>
              View Analytics
            </Button>
            <Button buttonStyle="subtle" size="small" onClick={() => handleEditForm(row.id)}>
              Edit Form
            </Button>
            <Button buttonStyle="subtle" size="small" onClick={() => void handleExportCsvForForm({ id: row.id })}>
              Export CSV
            </Button>
          </div>
        )),
      },
    ]
  }, [formRows, handleEditForm, handleExportCsvForForm, handleSelectForm, loadingCounts])

  const submissionColumns = useMemo(() => {
    const submittedAtField = buildTextField('submittedAt', 'Submitted At')
    const columns = [
      {
        accessor: 'submittedAt',
        field: submittedAtField,
        Heading: 'Submitted At',
        active: true,
        renderedCells: submissions.map((submission) => formatDateTime(submission.createdAt)),
      },
    ]

    fieldNames.forEach((fieldName) => {
      columns.push({
        accessor: fieldName,
        field: buildTextField(fieldName, fieldName),
        Heading: fieldName,
        active: true,
        renderedCells: submissions.map((submission) =>
          formatCsvValue(getSubmissionValue(submission, fieldName)),
        ),
      })
    })

    return columns
  }, [fieldNames, submissions])

  return (
    <Gutter>
      <SetStepNav nav={[{ label: 'Form Results' }]} />
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0 }}>Form Results</h1>
            <Pill pillStyle="light" rounded>
              {tenantName ? `Tenant: ${tenantName}` : 'All tenants'}
            </Pill>
          </div>
          <p style={{ margin: 0, color: 'var(--theme-elevation-500)' }}>
            Review submissions by form, export CSVs, and view question analytics.
          </p>
        </div>

        {error ? <Banner type="error">{error}</Banner> : null}

        {!selectedFormId ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Forms</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {loadingForms ? <Pill pillStyle="light">Loading forms…</Pill> : null}
                <Button buttonStyle="primary" size="small" onClick={handleCreateForm}>
                  New Form
                </Button>
              </div>
            </div>
            {!loadingForms && !forms.length ? <Banner type="info">No forms available for this tenant.</Banner> : null}
            {forms.length ? <Table columns={formColumns} data={formRows} /> : null}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <h2 style={{ margin: 0 }}>{selectedForm?.title || selectedForm?.name || 'Form results'}</h2>
                <div style={{ color: 'var(--theme-elevation-500)' }}>Form ID: {selectedFormId}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <Button buttonStyle="transparent" size="small" onClick={handleBackToForms}>
                  Back to Forms
                </Button>
                <Button buttonStyle="primary" size="small" onClick={() => handleSelectForm(selectedFormId, 'results')}>
                  Submissions
                </Button>
                <Button buttonStyle="secondary" size="small" onClick={() => handleSelectForm(selectedFormId, 'analytics')}>
                  Analytics
                </Button>
                <Button buttonStyle="subtle" size="small" onClick={() => handleEditForm(selectedFormId)}>
                  Edit Form
                </Button>
                <Button
                  buttonStyle="subtle"
                  size="small"
                  onClick={() => handleExportCsv(selectedForm || null, submissions)}
                >
                  Export CSV
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <Pill pillStyle="light-gray" rounded>
                {submissions.length} submissions
              </Pill>
              {loadingSubmissions ? <Pill pillStyle="light">Loading submissions…</Pill> : null}
            </div>

            {selectedTab === 'analytics' ? (
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {analytics.length ? (
                  analytics.map((field) => (
                    <div
                      key={field.name}
                      style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: '12px', padding: '1rem' }}
                    >
                      <div style={{ marginBottom: '0.75rem' }}>
                        <strong>{field.label}</strong>
                        <div style={{ color: 'var(--theme-elevation-500)' }}>{field.totalResponses} responses</div>
                      </div>
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {field.options.map((option) => (
                          <div key={option.value} style={{ display: 'grid', gap: '0.35rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{option.label}</span>
                              <span>
                                {option.count} ({option.percentage}%)
                              </span>
                            </div>
                            <div
                              style={{
                                height: '8px',
                                borderRadius: '999px',
                                background: 'var(--theme-elevation-150)',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${option.percentage}%`,
                                  height: '100%',
                                  background: 'var(--theme-success-500)',
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <Banner type="info">No analytics available for this form yet.</Banner>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                {!loadingSubmissions && !submissions.length ? <Banner type="info">No submissions yet.</Banner> : null}
                {submissions.length ? <Table columns={submissionColumns} data={submissions} /> : null}
              </div>
            )}
          </div>
        )}
      </div>
    </Gutter>
  )
}
