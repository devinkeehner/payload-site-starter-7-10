/**
 * Build a comprehensive ECS town-run CSV from the FY26 source file, enrich each row with
 * district membership from RepInfo, and write the normalized rows back into the existing
 * budgetPlanFeature block on the target page.
 *
 * Usage:
 *   pnpm tsx scripts/sync-budget-plan-town-runs.ts --source-csv "/mnt/c/Users/Devin Keehner/Downloads/ECS Entitlements and Percent of Total ECS by Town, FY 26.csv" --tenant main --page-slug budget-plan
 *
 * Optional:
 *   --output-csv backend/tmp/budget-plan-town-runs-comprehensive.csv
 *   --dry-run
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import payload from 'payload'

interface CliOpts {
  sourceCsv: string
  outputCsv: string
  pageSlug: string
  tenant?: string
  dryRun: boolean
}

interface SourceRow {
  town: string
  currentEcsEntitlement: number
  percentOfTotal: number
  enhancedEducationFunding: number
  newTotalFunding: number
}

interface EnrichedRow extends SourceRow {
  townKey: string
  districtNumbers: number[]
  districtLabels: string[]
  districtCount: number
  percentIncrease: number
  needsReview: boolean
}

function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const index = process.argv.findIndex((arg) => arg === flag)
    return index === -1 ? undefined : process.argv[index + 1]
  }

  const sourceCsv =
    get('--source-csv') ||
    '/mnt/c/Users/Devin Keehner/Downloads/ECS Entitlements and Percent of Total ECS by Town, FY 26.csv'
  const outputCsv = get('--output-csv') || path.resolve(process.cwd(), 'tmp/budget-plan-town-runs-comprehensive.csv')
  const pageSlug = get('--page-slug') || 'budget-plan'
  const tenant = get('--tenant')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')

  return { sourceCsv, outputCsv, pageSlug, tenant, dryRun }
}

const { sourceCsv, outputCsv, pageSlug, tenant: ONLY_TENANT, dryRun: DRY_RUN } = parseArgs()

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function csvEscape(value: unknown): string {
  const stringValue =
    value == null ? '' : typeof value === 'string' ? value : typeof value === 'number' ? String(value) : JSON.stringify(value)
  if (/[,"\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`
  return stringValue
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i++
      if (cell.length || row.length) {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      }
      continue
    }

    if (!inQuotes && char === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    cell += char
  }

  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,]/g, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parsePercent(value: string) {
  const cleaned = value.replace(/%/g, '').replace(/,/g, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function makeRichText(text: string) {
  return {
    root: {
      type: 'root',
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [
            {
              type: 'text',
              text,
              version: 1,
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
        },
      ],
    },
  }
}

function districtLabel(districtNumber: number) {
  const v = districtNumber % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : districtNumber % 10 === 1 ? 'st' : districtNumber % 10 === 2 ? 'nd' : districtNumber % 10 === 3 ? 'rd' : 'th'
  return `${districtNumber}${suffix} District`
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalized = headers.map((header) => normalizeKey(header))
  for (const alias of aliases) {
    const index = normalized.indexOf(normalizeKey(alias))
    if (index >= 0) return index
  }
  return -1
}

function getCell(row: string[], index: number) {
  return index >= 0 ? (row[index] || '').trim() : ''
}

;(async () => {
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

  console.log(`Connected to MongoDB – syncing budget plan town runs${DRY_RUN ? ' (dry-run)' : ''}…`)

  if (!fs.existsSync(sourceCsv)) {
    throw new Error(`Source CSV not found: ${sourceCsv}`)
  }

  const raw = fs.readFileSync(sourceCsv, 'utf8').replace(/^\uFEFF/, '')
  const parsed = parseCsv(raw)
  if (parsed.length < 2) throw new Error('CSV has no data rows')

  const headers = parsed[0]
  const townIndex = findHeaderIndex(headers, ['Town'])
  const ecsIndex = findHeaderIndex(headers, ['Current ECS Entitlement', 'ECS Entitlement'])
  const percentIndex = findHeaderIndex(headers, ['% of Total', 'Percent of Total'])
  const eefIndex = findHeaderIndex(headers, ['Enhanced Education Funding', 'EEF'])
  const totalIndex = findHeaderIndex(headers, ['New Total Funding (ECS + EEF)', 'New Total Funding'])

  if ([townIndex, ecsIndex, percentIndex, eefIndex, totalIndex].some((index) => index < 0)) {
    throw new Error(
      `Missing one or more required CSV columns. Found headers: ${headers.join(', ')}`,
    )
  }

  const sourceRows: SourceRow[] = []
  for (const row of parsed.slice(1)) {
    const town = getCell(row, townIndex)
    if (!town) continue
    if (normalizeKey(town) === 'total') continue

    sourceRows.push({
      town,
      currentEcsEntitlement: parseMoney(getCell(row, ecsIndex)),
      percentOfTotal: parsePercent(getCell(row, percentIndex)),
      enhancedEducationFunding: parseMoney(getCell(row, eefIndex)),
      newTotalFunding: parseMoney(getCell(row, totalIndex)),
    })
  }

  const repInfoRows: any[] = []
  const PAGE_SIZE = 100
  let page = 1
  while (true) {
    const res = await payload.find({
      collection: 'rep-info',
      page,
      limit: PAGE_SIZE,
      overrideAccess: true as any,
    })
    repInfoRows.push(...(res.docs as any[]))
    if (!res.hasNextPage || repInfoRows.length >= res.totalDocs) break
    page++
  }

  const townDistrictMap = new Map<string, Set<number>>()
  for (const rep of repInfoRows) {
    const districtNumber = Number(rep?.districtNumber)
    if (!Number.isFinite(districtNumber) || districtNumber <= 0) continue
    for (const townEntry of Array.isArray(rep?.towns) ? rep.towns : []) {
      const town = typeof townEntry?.town === 'string' ? townEntry.town.trim() : ''
      if (!town) continue
      const key = normalizeKey(town)
      if (!townDistrictMap.has(key)) townDistrictMap.set(key, new Set<number>())
      townDistrictMap.get(key)!.add(districtNumber)
    }
  }

  const enrichedRows: EnrichedRow[] = sourceRows.map((row) => {
    const townKey = normalizeKey(row.town)
    const districtNumbers = Array.from(townDistrictMap.get(townKey) || []).sort((a, b) => a - b)
    const percentIncrease = row.currentEcsEntitlement > 0 ? (row.enhancedEducationFunding / row.currentEcsEntitlement) * 100 : 0
    return {
      ...row,
      townKey,
      districtNumbers,
      districtLabels: districtNumbers.map((districtNumber) => districtLabel(districtNumber)),
      districtCount: districtNumbers.length,
      percentIncrease,
      needsReview: districtNumbers.length === 0,
    }
  })

  const featuredKeys = new Set(
    [...enrichedRows]
      .sort((a, b) => b.newTotalFunding - a.newTotalFunding)
      .slice(0, 6)
      .map((row) => row.townKey),
  )

  const comprehensiveHeaders = [
    'Town',
    'Town Key',
    'Current ECS Entitlement',
    '% of Total',
    'Percent Increase',
    'Enhanced Education Funding',
    'New Total Funding (ECS + EEF)',
    'District Numbers',
    'District Labels',
    'District Count',
    'Needs Review',
  ]

  const comprehensiveRows = [
    comprehensiveHeaders,
    ...enrichedRows.map((row) => [
      row.town,
      row.townKey,
      row.currentEcsEntitlement,
      row.percentOfTotal,
      row.percentIncrease,
      row.enhancedEducationFunding,
      row.newTotalFunding,
      row.districtNumbers.join('; '),
      row.districtLabels.join('; '),
      row.districtCount,
      row.needsReview ? 'yes' : 'no',
    ]),
  ]

  fs.mkdirSync(path.dirname(outputCsv), { recursive: true })
  fs.writeFileSync(outputCsv, comprehensiveRows.map((row) => row.map(csvEscape).join(',')).join('\n') + '\n', 'utf8')
  console.log(`Wrote comprehensive CSV: ${outputCsv}`)
  console.log(`Matched ${enrichedRows.length} source town row(s); ${enrichedRows.filter((row) => row.needsReview).length} need review`)

  const pageRes = await payload.find({
    collection: 'pages',
    where: {
      slug: { equals: pageSlug },
      ...(ONLY_TENANT ? { tenant: { equals: ONLY_TENANT } } : {}),
    } as any,
    limit: 1,
    overrideAccess: true as any,
    depth: 0,
  })

  if (!pageRes.totalDocs) {
    throw new Error(`Page not found for slug=${pageSlug}${ONLY_TENANT ? ` tenant=${ONLY_TENANT}` : ''}`)
  }

  const pageDoc = pageRes.docs[0] as any
  const nextLayout = Array.isArray(pageDoc?.layout)
    ? pageDoc.layout.map((block: any) => {
        if (block?.blockType !== 'budgetPlanFeature') return block

        return {
          ...block,
          townRows: enrichedRows.map((row) => ({
          town: row.town,
          districts: row.districtNumbers.length
            ? row.districtNumbers.map((districtNumber) => ({ district: String(districtNumber) }))
            : [],
          amount: row.newTotalFunding,
          currentEcsEntitlement: row.currentEcsEntitlement,
          percentOfTotal: row.percentOfTotal,
          percentIncrease: row.percentIncrease,
          enhancedEducationFunding: row.enhancedEducationFunding,
          districtCount: row.districtCount,
          needsReview: row.needsReview,
          amountLabel: formatCurrency(row.newTotalFunding),
          notes: makeRichText(
            row.districtNumbers.length
              ? `Current ECS entitlement ${formatCurrency(row.currentEcsEntitlement)}. Enhanced education funding ${formatCurrency(row.enhancedEducationFunding)}. Districts: ${row.districtLabels.join(', ')}.`
                : `Current ECS entitlement ${formatCurrency(row.currentEcsEntitlement)}. Enhanced education funding ${formatCurrency(row.enhancedEducationFunding)}. District membership needs review.`,
            ),
            featured: featuredKeys.has(row.townKey),
          })),
        }
      })
    : []

  if (DRY_RUN) {
    console.log(`· dry-run: would update page ${pageDoc.id} with ${enrichedRows.length} town row(s)`)
    process.exit(0)
  }

  const updated = await payload.update({
    collection: 'pages',
    id: pageDoc.id,
    data: { layout: nextLayout },
    overrideAccess: true,
    context: { disableRevalidate: true } as any,
  })

  console.log(`Updated page ${updated.id} with comprehensive town run data.`)
  process.exit(0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
