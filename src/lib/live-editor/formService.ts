import type { PayloadRequest } from 'payload'

import { canAccessCollection } from '@/lib/access/roles'
import type { Form } from '@/payload-types'

import { LiveEditorAccessError, relationshipID } from './emailAccess'
import {
  assertCurrentDraftRevision,
  NativeDraftError,
  normalizeFields,
  readExpectedUpdatedAt,
  type DraftField,
} from './emailDraft'
import { assertDraftReferences } from './emailService'
import {
  editorLayoutToFormFields,
  formFieldsToEditorLayout,
  getFormEditorSchema,
} from './formDocument'

const textSettings = ['title', 'submitButtonLabel'] as const
const toggleSettings = ['enableHoneypot', 'enableTurnstile'] as const
const editableFields = new Set([
  ...textSettings,
  ...toggleSettings,
  'layout',
  'confirmationType',
  'confirmationMessage',
  'redirect',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function loadEditorForm(req: PayloadRequest, id: string, depth = 2) {
  if (!canAccessCollection(req.user, 'forms')) {
    throw new LiveEditorAccessError('Sign in with an account authorized to edit forms.', 403)
  }

  return req.payload.findByID({ collection: 'forms', id, depth, overrideAccess: false, req })
}

function editorForm(form: Form) {
  return {
    collection: 'forms' as const,
    id: form.id,
    title: form.title,
    layout: formFieldsToEditorLayout(form.fields),
    submitButtonLabel: form.submitButtonLabel || 'Submit',
    confirmationType: form.confirmationType === 'redirect' ? 'redirect' : 'message',
    confirmationMessage: form.confirmationMessage ?? null,
    redirect: form.redirect,
    enableHoneypot: form.enableHoneypot !== false,
    enableTurnstile: form.enableTurnstile === true,
    updatedAt: form.updatedAt,
    tenantName: typeof form.tenant === 'object' ? form.tenant?.name : undefined,
  }
}

export async function getEditorForm(req: PayloadRequest, id: string) {
  const form = await loadEditorForm(req, id)
  return { form: editorForm(form), schemas: getFormEditorSchema() }
}

function buildFormPatch(incoming: Record<string, unknown>, current: Form, fields: DraftField[]) {
  if (Object.keys(incoming).some((field) => !editableFields.has(field))) {
    throw new NativeDraftError('Only form content and builder settings may be changed here.')
  }

  const patch: Record<string, unknown> = {}
  for (const name of textSettings) {
    if (!Object.hasOwn(incoming, name)) continue
    const value = incoming[name]
    if (typeof value !== 'string') throw new NativeDraftError(`${name} must be text.`)
    if (name === 'title' && !value.trim()) throw new NativeDraftError('Give this form a name before saving.')
    patch[name] = value.trim() || 'Submit'
  }

  for (const name of toggleSettings) {
    if (!Object.hasOwn(incoming, name)) continue
    if (typeof incoming[name] !== 'boolean') throw new NativeDraftError(`${name} must be on or off.`)
    patch[name] = incoming[name]
  }

  if (Object.hasOwn(incoming, 'confirmationType')) {
    if (incoming.confirmationType !== 'message' && incoming.confirmationType !== 'redirect') {
      throw new NativeDraftError('Choose a message or redirect after submission.')
    }
    patch.confirmationType = incoming.confirmationType
  }

  if (Object.hasOwn(incoming, 'confirmationMessage')) {
    const message = incoming.confirmationMessage
    if (message !== null && (!isRecord(message) || !isRecord(message.root) || message.root.type !== 'root')) {
      throw new NativeDraftError('The confirmation message must be rich text.')
    }
    patch.confirmationMessage = message
  }

  if (Object.hasOwn(incoming, 'redirect') && incoming.redirect != null) {
    if (!isRecord(incoming.redirect) || (incoming.redirect.url != null && typeof incoming.redirect.url !== 'string')) {
      throw new NativeDraftError('Enter a redirect URL after submission.')
    }
    const url = typeof incoming.redirect.url === 'string' ? incoming.redirect.url.trim() : ''
    if (url) patch.redirect = { url }
    else if ((patch.confirmationType ?? current.confirmationType) === 'redirect') {
      throw new NativeDraftError('Enter a redirect URL after submission.')
    }
  }

  if ((patch.confirmationType ?? current.confirmationType) === 'redirect' && !(patch.redirect || current.redirect?.url?.trim())) {
    throw new NativeDraftError('Enter a redirect URL after submission.')
  }

  if (Object.hasOwn(incoming, 'layout')) {
    try {
      patch.fields = editorLayoutToFormFields(incoming.layout, current.fields)
    } catch (error) {
      throw new NativeDraftError(error instanceof Error ? error.message : 'The form layout is invalid.')
    }
  }

  if (!Object.keys(patch).length) throw new NativeDraftError('No changes to the form were supplied.')
  return normalizeFields(patch, fields)
}

export async function saveEditorForm(req: PayloadRequest, id: string, body: unknown) {
  if (!isRecord(body) || !isRecord(body.form) || Object.keys(body).some((key) => key !== 'form' && key !== 'expectedUpdatedAt')) {
    throw new NativeDraftError('Send the form and its expectedUpdatedAt revision.')
  }

  const expectedUpdatedAt = readExpectedUpdatedAt(body.expectedUpdatedAt)
  const current = await loadEditorForm(req, id, 0)
  assertCurrentDraftRevision(current, expectedUpdatedAt, 'form')
  const fields = req.payload.config.collections.find((collection) => collection.slug === 'forms')?.fields as DraftField[] | undefined
  if (!fields) throw new Error('The form schema is unavailable.')

  const patch = buildFormPatch(body.form, current, fields)
  await assertDraftReferences(req, patch, current, fields, relationshipID(current.tenant), 'form')

  // Keep the revision in Payload's transactional update query as well as the initial read.
  const result = await req.payload.update({
    collection: 'forms',
    data: patch,
    where: { and: [{ id: { equals: id } }, { updatedAt: { equals: expectedUpdatedAt } }] },
    limit: 1,
    depth: 2,
    overrideAccess: false,
    overrideLock: false,
    req,
  })

  const failure = result.errors[0]
  if (failure) {
    if (failure.isPublic) throw new NativeDraftError(failure.message)
    throw new Error(failure.message)
  }

  const form = result.docs[0]
  if (!form) {
    throw new NativeDraftError('This form changed after you opened it, or is no longer editable. Reload before saving again.', 409)
  }
  return { form: editorForm(form) }
}
