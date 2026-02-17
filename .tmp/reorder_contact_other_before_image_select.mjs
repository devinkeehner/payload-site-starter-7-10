const { config: dotenvConfig } = await import('dotenv')
dotenvConfig({ path: '.env.local' })
dotenvConfig()

const { default: configPromise } = await import('../src/payload.config.ts')
const { getPayload } = await import('payload')

const config = await configPromise
const payload = await getPayload({ config })

const changed = []
const unchanged = []
const skipped = []
const failed = []

let page = 1
let done = false
let totalScanned = 0
let totalContact = 0

while (!done) {
  const result = await payload.find({
    collection: 'forms',
    limit: 100,
    page,
    depth: 1,
    overrideAccess: true,
  })

  totalScanned = result.totalDocs

  for (const form of result.docs) {
    const title = String(form?.title || '')
    if (!/contact/i.test(title)) continue
    totalContact += 1

    const fields = Array.isArray(form?.fields) ? [...form.fields] : []
    const otherIdx = fields.findIndex(
      (f) => f && typeof f === 'object' && f.blockType === 'textarea' && f.name === 'other',
    )

    let imageIdx = -1
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i]
      if (f && typeof f === 'object' && f.blockType === 'image-select') {
        imageIdx = i
      }
    }

    const tenant =
      typeof form.tenant === 'object' && form.tenant
        ? {
            id: String(form.tenant.id),
            slug: form.tenant.slug || null,
            name: form.tenant.name || null,
          }
        : { id: form.tenant ? String(form.tenant) : null, slug: null, name: null }

    const base = {
      formId: String(form.id),
      title,
      tenant,
      fieldCount: fields.length,
      otherIndex: otherIdx,
      imageSelectIndex: imageIdx,
    }

    if (otherIdx === -1 || imageIdx === -1) {
      skipped.push({ ...base, reason: 'missing_other_or_image_select' })
      continue
    }

    const desired = otherIdx === fields.length - 2 && imageIdx === fields.length - 1
    if (desired) {
      unchanged.push(base)
      continue
    }

    const imageField = fields[imageIdx]
    const otherField = fields[otherIdx]

    const rebuilt = fields.filter((_f, idx) => idx !== imageIdx && idx !== otherIdx)
    rebuilt.push(otherField)
    rebuilt.push(imageField)

    try {
      await payload.update({
        collection: 'forms',
        id: String(form.id),
        data: { fields: rebuilt },
        overrideAccess: true,
      })

      changed.push({
        ...base,
        newOtherIndex: rebuilt.length - 2,
        newImageSelectIndex: rebuilt.length - 1,
      })
    } catch (error) {
      failed.push({
        ...base,
        reason: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  if (page >= result.totalPages) done = true
  page += 1
}

const report = {
  summary: {
    totalScanned,
    totalContact,
    changedCount: changed.length,
    unchangedCount: unchanged.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
  },
  changed,
  unchanged,
  skipped,
  failed,
}

console.log(JSON.stringify(report, null, 2))
await payload.db.destroy()
