type MailExportJobStatus = 'queued' | 'running' | 'complete' | 'error'

export type MailExportJobSnapshot = {
  id: string
  status: MailExportJobStatus
  total: number
  completed: number
  currentTenantLabel: string | null
  skippedCount: number
  error: string | null
  downloadName: string
  createdAt: number
  updatedAt: number
}

export type MailExportJobRecord = MailExportJobSnapshot & {
  result: Buffer | null
}

const getStore = () => {
  const globalKey = '__graphicsEditorMailExportJobs'
  const globalWithStore = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, MailExportJobRecord>
  }

  if (!globalWithStore[globalKey]) {
    globalWithStore[globalKey] = new Map<string, MailExportJobRecord>()
  }

  return globalWithStore[globalKey] as Map<string, MailExportJobRecord>
}

export const mailExportJobs = getStore()

export const createMailExportJob = (id: string, total: number, downloadName: string) => {
  const job: MailExportJobRecord = {
    id,
    status: 'queued',
    total,
    completed: 0,
    currentTenantLabel: null,
    skippedCount: 0,
    error: null,
    downloadName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
  }
  mailExportJobs.set(id, job)
  return job
}

export const updateMailExportJob = (id: string, patch: Partial<MailExportJobRecord>) => {
  const current = mailExportJobs.get(id)
  if (!current) return null
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  }
  mailExportJobs.set(id, next)
  return next
}

export const getMailExportJob = (id: string) => mailExportJobs.get(id) || null

export const deleteMailExportJob = (id: string) => {
  mailExportJobs.delete(id)
}
