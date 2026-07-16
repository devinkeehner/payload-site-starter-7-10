import fs from 'node:fs/promises'
import path from 'node:path'

import { getPayload, type PayloadRequest } from 'payload'

import configPromise from '@payload-config'

export const runtime = 'nodejs'

type CsvTownFundingRow = {
  town: string
  townKey: string
  currentEcsEntitlement: number
  strapAid: number
  percentIncrease: number
  enhancedEducationFunding: number
  newTotalFunding: number
  districtNumbers: string
  districtLabels: string
  districtCount: number
  needsReview: boolean
}

type RepTown = {
  town?: string | null
  currentEcsEntitlement?: number | null
  houseGopStrapAid?: number | null
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

const getString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const parseNumber = (value: string) => {
  const numeric = Number((value || '').replace(/[$,%]/g, '').replace(/,/g, '').trim())
  return Number.isFinite(numeric) ? numeric : 0
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1
      if (cell.length || row.length) {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      }
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

const findHeaderIndex = (headers: string[], aliases: string[]) => {
  const normalizedHeaders = headers.map((header) => normalizeKey(header))
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeKey(alias))
    if (index >= 0) return index
  }
  return -1
}

const getCell = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '')

async function readTownFundingCsv(): Promise<Map<string, CsvTownFundingRow>> {
  const filePath = path.resolve(process.cwd(), 'tmp/budget-plan-town-runs-comprehensive.csv')
  const raw = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '')
  const parsed = parseCsv(raw)
  if (parsed.length < 2) return new Map()

  const headers = parsed[0] || []
  const townIndex = findHeaderIndex(headers, ['Town'])
  const townKeyIndex = findHeaderIndex(headers, ['Town Key'])
  const currentEcsIndex = findHeaderIndex(headers, ['Current ECS Entitlement'])
  const strapAidIndex = findHeaderIndex(headers, ['House GOP STRAP Aid', 'STRAP Aid', 'STRAP', 'Enhanced Education Funding'])
  const percentIncreaseIndex = findHeaderIndex(headers, ['Percent Increase'])
  const enhancedEducationFundingIndex = findHeaderIndex(headers, ['Enhanced Education Funding'])
  const newTotalFundingIndex = findHeaderIndex(headers, ['New Total Funding (ECS + EEF)'])
  const districtNumbersIndex = findHeaderIndex(headers, ['District Numbers'])
  const districtLabelsIndex = findHeaderIndex(headers, ['District Labels'])
  const districtCountIndex = findHeaderIndex(headers, ['District Count'])
  const needsReviewIndex = findHeaderIndex(headers, ['Needs Review'])

  const rows = new Map<string, CsvTownFundingRow>()

  for (const row of parsed.slice(1)) {
    const town = getCell(row, townIndex)
    if (!town) continue

    const townKey = getCell(row, townKeyIndex) || normalizeKey(town)
    rows.set(townKey, {
      town,
      townKey,
      currentEcsEntitlement: parseNumber(getCell(row, currentEcsIndex)),
      strapAid: parseNumber(getCell(row, strapAidIndex)),
      percentIncrease: parseNumber(getCell(row, percentIncreaseIndex)),
      enhancedEducationFunding: parseNumber(getCell(row, enhancedEducationFundingIndex)),
      newTotalFunding: parseNumber(getCell(row, newTotalFundingIndex)),
      districtNumbers: getCell(row, districtNumbersIndex),
      districtLabels: getCell(row, districtLabelsIndex),
      districtCount: parseNumber(getCell(row, districtCountIndex)),
      needsReview: getCell(row, needsReviewIndex).toLowerCase() === 'yes',
    })
  }

  return rows
}

export async function GET(req: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })

  let user: unknown
  try {
    user = await payload.auth({ req: req as unknown as PayloadRequest, headers: req.headers })
  } catch (error) {
    payload.logger.error({ error }, 'Auth error while loading experimental town funding graphic data')
    return new Response('Unauthorized', { status: 401 })
  }

  if (!user) return new Response('Unauthorized', { status: 401 })

  const requestUrl = new URL(req.url)
  const tenantID = requestUrl.searchParams.get('tenant')?.trim()
  if (!tenantID) return new Response('Missing tenant parameter', { status: 400 })

  try {
    const [tenant, repResponse, standardMediaResponse, csvRows] = await Promise.all([
      payload.findByID({
        collection: 'tenants',
        id: tenantID,
        depth: 0,
        req: req as unknown as PayloadRequest,
      }),
      payload.find({
        collection: 'rep-info',
        where: { tenant: { equals: tenantID } },
        limit: 1,
        depth: 1,
        req: req as unknown as PayloadRequest,
      }),
      payload.find({
        collection: 'standard-media',
        where: { tenant: { equals: tenantID } },
        limit: 1,
        depth: 1,
        req: req as unknown as PayloadRequest,
      }),
      readTownFundingCsv(),
    ])

    const repInfo = repResponse.docs[0]
    const standardMedia = standardMediaResponse.docs[0] || null

    if (!repInfo) {
      return new Response(JSON.stringify({ message: 'No rep-info record found for the selected tenant.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }

    const repInfoRecord = asRecord(repInfo as unknown) || {}
    const towns = Array.isArray(repInfoRecord.towns)
      ? ((repInfoRecord.towns as RepTown[]) || [])
      : []

    const townRows = towns.map((townEntry, index) => {
      const townName = getString(townEntry?.town)?.trim() || `Town ${index + 1}`
      const csvMatch = csvRows.get(normalizeKey(townName))
      const currentEcsEntitlement =
        getNumber(townEntry?.currentEcsEntitlement) ?? csvMatch?.currentEcsEntitlement ?? 0
      const strapAid = csvMatch?.strapAid ?? getNumber(townEntry?.houseGopStrapAid) ?? csvMatch?.enhancedEducationFunding ?? 0

      return {
        id: `${normalizeKey(townName) || 'town'}-${index}`,
        town: townName,
        matched: Boolean(csvMatch),
        needsReview: csvMatch?.needsReview ?? false,
        currentEcsEntitlement,
        strapAid,
        percentIncrease: csvMatch?.percentIncrease ?? 0,
        newTotalFunding: csvMatch?.newTotalFunding ?? currentEcsEntitlement + strapAid,
        districtLabels: csvMatch?.districtLabels || '',
      }
    })

    const responseBody = {
      tenant: {
        id: getString(asRecord(tenant)?.id) || tenantID,
        name: getString(asRecord(tenant)?.name) || '',
        slug: getString(asRecord(tenant)?.slug) || '',
      },
      repInfo: {
        id: getString(repInfoRecord.id) || '',
        name: getString(repInfoRecord.name) || '',
        officeTitle: getString(repInfoRecord.officeTitle) || '',
        districtNumber: getNumber(repInfoRecord.districtNumber) || 0,
      },
      standardMedia,
      townRows,
      unmatchedTownCount: townRows.filter((row) => !row.matched).length,
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    payload.logger.error({ error, tenantID }, 'Failed to load experimental town funding graphic data')
    const message = error instanceof Error ? error.message : 'Failed to load graphic data'
    return new Response(JSON.stringify({ message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
