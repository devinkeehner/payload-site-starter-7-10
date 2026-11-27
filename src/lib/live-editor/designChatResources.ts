import { createHash } from 'node:crypto'
import type { ToolCallOutputContent } from '@openai/agents'
import type { PayloadRequest, Where } from 'payload'
import { z } from 'zod-v4'
import type { Form } from '@/payload-types'
import { slugifyFieldName } from '@/lib/puck/converters'
import { canAccessCollection } from '@/lib/access/roles'
import { relationshipID, LiveEditorAccessError } from './emailAccess'
import { NativeDraftError } from './emailDraft'
import { createLexicalValueFromText, getPlainTextFromLexical } from './lexical'
import { assertSiteLibraryAccess, browseSiteGallery } from './siteGallery'

const shortText = z.string().trim().min(1).max(160)
const gallery = z.strictObject({
  query: z.string().max(150).optional(), page: z.number().int().min(1).max(10_000).optional(),
  mediaId: z.string().min(1).max(100).optional(),
})
const searchForms = z.strictObject({ query: z.string().max(150).optional(), page: z.number().int().min(1).max(10_000).optional() })
const field = z.strictObject({
  type: z.enum(['text', 'email', 'textarea', 'number', 'checkbox', 'select', 'radio', 'checkbox-group']),
  label: shortText, required: z.boolean().optional(), width: z.enum(['full', 'half']).optional(),
  options: z.array(shortText).min(1).max(40).optional(),
})
const newForm = z.strictObject({
  title: shortText, submitButtonLabel: shortText,
  confirmationMessage: z.string().trim().min(1).max(1_000),
  fields: z.array(field).min(1).max(30),
})

export const designResourceDefinitions = [
  { name: 'live_editor_browse_gallery', title: 'Inspecting site gallery images', schema: gallery,
    description: 'See actual pictures from the current site gallery, with each thumbnail paired with its media ID, alt text and dimensions. Browse six at a time by page, search filename or alt text with query, or inspect one mediaId at larger size. Use the chosen ID for a native sectionImage or sectionGallery.' },
  { name: 'live_editor_find_forms', title: 'Checking available forms', schema: searchForms,
    description: 'Find existing forms on this site by optional title query and page. Returns editable form IDs with their actual input labels, types, required flags and submit button. Use one if it matches the requested form.' },
  { name: 'live_editor_create_form', title: 'Creating a reusable form', schema: newForm,
    description: 'Create a real, reusable Payload form for the current site when a user requests a form. The form is saved in Forms immediately. Provide title, submitButtonLabel, confirmationMessage and ordered fields. Each field takes its type, label, optional required and width (full or half). Select, radio and checkbox-group require distinct option labels. Returns the ID for sectionForm.form. A matching existing form can be reused.' },
]

type Field = NonNullable<Form['fields']>[number]
type FormSummary = Pick<Form, 'title' | 'id' | 'submitButtonLabel' | 'fields'>
function describeForm(form: FormSummary) {
  return { formId: form.id, title: form.title, submitButtonLabel: form.submitButtonLabel, fields: (form.fields || []).map(field => ({
    type: field.blockType, ...('name' in field ? { name: field.name, label: field.label, required: Boolean(field.required),
      width: field.width || 100 } : {}), ...('options' in field ? { options: field.options?.map(item => item.label) } : {}),
  })) }
}

const formSelect = { tenant: true, title: true, submitButtonLabel: true, fields: true } as const
async function findForms(req: PayloadRequest, tenant: string, input: z.infer<typeof searchForms>) {
  const and: Where[] = [{ tenant: { equals: tenant } }]
  if (input.query?.trim()) and.push({ title: { like: input.query.trim() } })
  const result = await req.payload.find({ collection: 'forms', where: { and }, depth: 0, req, overrideAccess: false,
    select: formSelect, page: input.page || 1, limit: 10, sort: '-createdAt' })
  return { forms: result.docs.filter(form => relationshipID(form.tenant) === tenant).map(describeForm), nextPage: result.nextPage }
}

function buildFields(inputs: z.infer<typeof newForm>['fields']): Field[] {
  const names = new Set<string>([...Object.getOwnPropertyNames(Object.prototype), 'prototype', 'companyWebsite', 'turnstileToken'])
  return inputs.map((input, index) => {
    const base = slugifyFieldName(input.label, 'field' + (index + 1))
    let name = base
    for (let suffix = 2; names.has(name); suffix++) name = base + suffix
    names.add(name)
    const common = { name, label: input.label, width: input.width === 'half' ? 50 : 100, required: input.required === true }
    if (input.type === 'select' || input.type === 'radio' || input.type === 'checkbox-group') {
      if (!input.options?.length || new Set(input.options).size !== input.options.length) {
        throw new NativeDraftError('Give each choice field a list of distinct options.')
      }
      return { ...common, blockType: input.type, options: input.options.map(label => ({ label, value: label })) }
    }
    if (input.options) throw new NativeDraftError('Options belong on select, radio or checkbox-group fields.')
    return { ...common, blockType: input.type }
  })
}

async function createForm(req: PayloadRequest, tenant: string, data: z.infer<typeof newForm>) {
  const fields = buildFields(data.fields)
  const lookup = () => req.payload.find({ collection: 'forms', depth: 0, overrideAccess: false, req,
    where: { and: [{ tenant: { equals: tenant } }, { title: { equals: data.title } }] },
    limit: 10, select: { ...formSelect, confirmationType: true, confirmationMessage: true } })
  const confirmationMessage = { ...createLexicalValueFromText(data.confirmationMessage) }
  const confirmationText = getPlainTextFromLexical(confirmationMessage)
  async function matching() {
    const current = (await lookup()).docs.filter(form => relationshipID(form.tenant) === tenant)
    if (!current.length) return null
    const expected = { title: data.title, fields, submitButtonLabel: data.submitButtonLabel }
    const shape = (form: FormSummary) => JSON.stringify({ ...describeForm(form), formId: undefined })
    const existing = current.find(form => shape(form) === shape({ ...form, ...expected }) && form.confirmationType === 'message'
      && getPlainTextFromLexical(form.confirmationMessage) === confirmationText)
    if (!existing) throw new NativeDraftError('This site already has a different form with that title. Inspect it with live_editor_find_forms or give the new form a more specific title.')
    return { ...describeForm(existing), created: false }
  }
  const existing = await matching()
  if (existing) return existing
  const key = createHash('sha256').update(JSON.stringify([tenant, data.title, fields, data.submitButtonLabel, confirmationText])).digest('hex')
  try {
    const form = await req.payload.create({
      collection: 'forms', overrideAccess: false, depth: 0, req, context: { ...req.context, designChatFormKey: key },
      data: { tenant, title: data.title, fields, submitButtonLabel: data.submitButtonLabel, confirmationType: 'message',
        confirmationMessage, enableHoneypot: true, emails: [], designChatFormKey: key },
    })
    return { ...describeForm(form), created: true }
  } catch (error) {
    // A second chat may have created the same form between our read and insert.
    const concurrent = await matching()
    if (concurrent) return concurrent
    throw error
  }
}

export type DesignResourceContext = { req: PayloadRequest; tenantId: string | null }
export async function runDesignResource(context: DesignResourceContext, name: string, args: unknown, signal?: AbortSignal): Promise<string | ToolCallOutputContent[]> {
  const { req, tenantId } = context
  assertSiteLibraryAccess(req, tenantId)
  signal?.throwIfAborted()
  if (name === 'live_editor_browse_gallery') return browseSiteGallery(req, tenantId, gallery.parse(args), signal)
  if (!canAccessCollection(req.user, 'forms')) throw new LiveEditorAccessError('Your account cannot access forms.', 403)
  if (name === 'live_editor_find_forms') return JSON.stringify(await findForms(req, tenantId, searchForms.parse(args)))
  if (name === 'live_editor_create_form') return JSON.stringify(await createForm(req, tenantId, newForm.parse(args)))
  throw new NativeDraftError('Unknown site resource tool.')
}
