import { getIContactConfigFromEnv, iContactFetch, resolveIContactAccountId } from '@/lib/icontact'

type RecordValue = Record<string, unknown>
type Metric = 'bounced' | 'clicked' | 'delivered' | 'opened' | 'unsubscribed'

export type IContactReport = {
  state: 'available' | 'pending' | 'unavailable'
  delivery: 'queued' | 'sending' | 'sent' | 'failed' | null
  counts: Partial<Record<Metric, number>>
  topLinks: Array<{ count: number; url: string }>
}

const emptyReport: IContactReport = { state: 'unavailable', delivery: null, counts: {}, topLinks: [] }

const fields = {
  bounced: ['bounces', 'bounced', 'bouncesTotal'],
  clicked: ['clicksUnique', 'uniqueClicks', 'clicks', 'clicked'],
  delivered: ['delivered', 'deliveredTotal', 'deliveredCount'],
  opened: ['opensUnique', 'uniqueOpens', 'opens', 'opened'],
  unsubscribed: ['unsubscribes', 'unsubscribed', 'unsubscribesTotal'],
} as const

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function count(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function urlFrom(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export async function getIContactReport({
  clientFolderId, messageId, sendId,
}: {
  clientFolderId: string
  messageId: string
  sendId: string
}): Promise<IContactReport> {
  const cfg = getIContactConfigFromEnv()
  if (!cfg || !clientFolderId || !messageId) return emptyReport
  try {
    const accountId = await resolveIContactAccountId(cfg)
    const folder = '/icp/a/' + encodeURIComponent(accountId) + '/c/' + encodeURIComponent(clientFolderId)
    const resource = folder + '/messages/' + encodeURIComponent(messageId)
    const read = (path: string) => iContactFetch(cfg, path, { signal: AbortSignal.timeout(8000) }).catch(() => null)
    const [sendResponse, statsResponse] = await Promise.all([
      sendId ? read(folder + '/sends/' + encodeURIComponent(sendId)) : null,
      read(resource + '/statistics'),
    ])
    const send = record(record(sendResponse?.data)?.send)
    const status = String(send?.status || '').toLowerCase()
    const delivery = status === 'complete' || status === 'completed' ? 'sent'
      : status === 'pending' || status === 'queued' ? 'queued'
      : status === 'sending' ? 'sending'
      : status === 'failed' || status === 'canceled' || status === 'cancelled' ? 'failed'
      : null
    const rawStatistics = record(statsResponse?.data)?.statistics
    const statistics = record(Array.isArray(rawStatistics) ? rawStatistics[0] : rawStatistics)
    const counts: IContactReport['counts'] = {}
    for (const metric of Object.keys(fields) as Metric[]) {
      const value = fields[metric].map(field => count(statistics?.[field])).find(value => value !== undefined)
      if (value !== undefined) counts[metric] = value
    }

    const links = new Map<string, number>()
    const limit = 500
    let linksAvailable = true
    for (let offset = 0; ; offset += limit) {
      const response = await read(resource + '/clicks?limit=' + limit + '&offset=' + offset)
      const page = record(response?.data)
      const clicks = page?.clicks
      if (!response?.ok || !Array.isArray(clicks)) {
        linksAvailable = false
        break
      }
      for (const entry of clicks) {
        const row = record(entry)
        const url = urlFrom(row?.url || row?.linkUrl || row?.link)
        if (url) links.set(url, (links.get(url) || 0) + (count(row?.clickCount ?? row?.count) ?? 1))
      }
      const total = count(page?.total)
      if (!clicks.length || (total !== undefined ? offset + clicks.length >= total : clicks.length < limit)) break
    }

    return {
      state: Object.keys(counts).length || (linksAvailable && links.size) ? 'available'
        : delivery === 'sending' || delivery === 'queued' ? 'pending' : 'unavailable',
      delivery,
      counts,
      topLinks: linksAvailable ? [...links].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([url, count]) => ({ url, count })) : [],
    }
  } catch {
    return emptyReport
  }
}
