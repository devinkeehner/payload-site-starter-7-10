import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

type TenantDoc = {
  id: string
  slug?: string
  name?: string
}

type FormDoc = {
  id: string
  title?: string
  tenant?: string | TenantDoc | null
}

type SubmissionField = {
  field?: string
  value?: string
}

type SubmissionDoc = {
  id: string
  tenant?: string | TenantDoc | null
  form?: string | FormDoc
  submissionData?: SubmissionField[] | null
  submitterEmail?: string | null
  submitterIP?: string | null
  createdAt: string
  updatedAt: string
}

const TARGET_SLUGS = ['aniskovich', 'carney', 'howard', 'pavalock', 'pizzuto', 'vail']
const FORM_TITLE = 'Contact Form'

const csvEscape = (value: unknown): string => {
  const raw = value == null ? '' : String(value)
  const escaped = raw.replace(/"/g, '""')
  return `"${escaped}"`
}

const getTenantMeta = (tenant: string | TenantDoc | null | undefined) => {
  if (!tenant) return { tenantId: null, tenantSlug: null, tenantName: null }
  if (typeof tenant === 'string') return { tenantId: tenant, tenantSlug: null, tenantName: null }
  return {
    tenantId: tenant.id ?? null,
    tenantSlug: tenant.slug ?? null,
    tenantName: tenant.name ?? null,
  }
}

async function bootstrap() {
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const configPath = path.resolve(__dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath
  try {
    await import('tsconfig-paths/register')
  } catch {}
  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })
}

const findTenantsBySlug = async (slugs: string[]) => {
  const found: TenantDoc[] = []
  let page = 1
  let done = false

  while (!done) {
    const result = await payload.find({
      collection: 'tenants',
      where: { slug: { in: slugs } },
      limit: 100,
      page,
      overrideAccess: true as any,
    })

    for (const doc of result.docs as unknown as TenantDoc[]) {
      found.push(doc)
    }

    if (page >= result.totalPages) done = true
    page += 1
  }

  return found
}

const findContactFormsByTenantIds = async (tenantIds: string[]) => {
  const found: FormDoc[] = []
  let page = 1
  let done = false

  while (!done) {
    const result = await payload.find({
      collection: 'forms',
      where: {
        and: [{ title: { equals: FORM_TITLE } }, { tenant: { in: tenantIds } }],
      },
      depth: 1,
      limit: 100,
      page,
      overrideAccess: true as any,
    })

    for (const doc of result.docs as unknown as FormDoc[]) {
      found.push(doc)
    }

    if (page >= result.totalPages) done = true
    page += 1
  }

  return found
}

const findSubmissionsByFormIds = async (formIds: string[]) => {
  const found: SubmissionDoc[] = []
  let page = 1
  let done = false

  while (!done) {
    const result = await payload.find({
      collection: 'form-submissions',
      where: { form: { in: formIds } },
      depth: 1,
      limit: 200,
      page,
      sort: '-createdAt',
      overrideAccess: true as any,
    })

    for (const doc of result.docs as unknown as SubmissionDoc[]) {
      found.push(doc)
    }

    if (page >= result.totalPages) done = true
    page += 1
  }

  return found
}

const run = async () => {
  await bootstrap()

  const tenants = await findTenantsBySlug(TARGET_SLUGS)
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]))
  const missingSlugs = TARGET_SLUGS.filter((slug) => !tenants.some((tenant) => tenant.slug === slug))

  if (missingSlugs.length > 0) {
    console.warn(`Missing tenants for slugs: ${missingSlugs.join(', ')}`)
  }

  const tenantIds = tenants.map((tenant) => tenant.id)
  if (tenantIds.length === 0) {
    throw new Error('No matching tenants found.')
  }

  const forms = await findContactFormsByTenantIds(tenantIds)
  const formIds = forms.map((form) => form.id)
  if (formIds.length === 0) {
    throw new Error(`No "${FORM_TITLE}" forms found for selected tenants.`)
  }

  const formById = new Map(forms.map((form) => [form.id, form]))
  const submissions = await findSubmissionsByFormIds(formIds)

  const dynamicFieldNames = Array.from(
    new Set(
      submissions.flatMap((submission) =>
        (submission.submissionData ?? [])
          .map((entry) => (entry.field ?? '').trim())
          .filter((name) => name.length > 0),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const header = [
    'submissionId',
    'createdAt',
    'updatedAt',
    'tenantSlug',
    'tenantName',
    'formId',
    'formTitle',
    'submitterEmail',
    'submitterIP',
    ...dynamicFieldNames,
  ]

  const rows: string[] = [header.map(csvEscape).join(',')]

  for (const submission of submissions) {
    const formRef = typeof submission.form === 'string' ? formById.get(submission.form) : submission.form
    const formId = typeof submission.form === 'string' ? submission.form : (submission.form?.id ?? '')
    const formTitle = formRef?.title ?? FORM_TITLE

    const tenantMetaFromSubmission = getTenantMeta(submission.tenant)
    const tenantMetaFromForm = getTenantMeta(formRef?.tenant ?? null)
    const tenantId = tenantMetaFromSubmission.tenantId ?? tenantMetaFromForm.tenantId
    const tenantDoc = tenantId ? tenantById.get(tenantId) : undefined

    const tenantSlug = tenantMetaFromSubmission.tenantSlug ?? tenantMetaFromForm.tenantSlug ?? tenantDoc?.slug ?? ''
    const tenantName = tenantMetaFromSubmission.tenantName ?? tenantMetaFromForm.tenantName ?? tenantDoc?.name ?? ''

    const valueMap = new Map<string, string>()
    for (const entry of submission.submissionData ?? []) {
      const name = (entry.field ?? '').trim()
      if (!name) continue
      const rawValue = entry.value ?? ''
      const existing = valueMap.get(name)
      if (existing && existing.length > 0 && rawValue.length > 0) {
        valueMap.set(name, `${existing}; ${rawValue}`)
      } else {
        valueMap.set(name, rawValue)
      }
    }

    const row = [
      submission.id,
      submission.createdAt,
      submission.updatedAt,
      tenantSlug,
      tenantName,
      formId,
      formTitle,
      submission.submitterEmail ?? '',
      submission.submitterIP ?? '',
      ...dynamicFieldNames.map((name) => valueMap.get(name) ?? ''),
    ]

    rows.push(row.map(csvEscape).join(','))
  }

  const outDir = path.resolve(process.cwd(), 'tmp')
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(outDir, `contact-form-results-${TARGET_SLUGS.join('-')}-${stamp}.csv`)
  fs.writeFileSync(outPath, `${rows.join('\n')}\n`, 'utf8')

  console.log(JSON.stringify({
    formTitle: FORM_TITLE,
    targetSlugs: TARGET_SLUGS,
    tenantCount: tenants.length,
    formCount: forms.length,
    submissionCount: submissions.length,
    output: outPath,
  }, null, 2))
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
