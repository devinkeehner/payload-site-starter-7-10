import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

export type EmailLinkCheck = {
  checkedAt?: string
  confirmed?: boolean
  confirmedAt?: string
  href: string
  label: string
  reason?: string
  remoteStatus?: number
  status: 'invalid' | 'merge' | 'ok' | 'warning'
}

export type EmailQualityResult = {
  label: 'Good' | 'Needs review' | 'Risky'
  links: EmailLinkCheck[]
  score: number
  warnings: string[]
}

export type DeclaredEmailLink = {
  href: string
  label: string
}

export type RemoteLinkAddress = {
  address: string
  family: 4 | 6
}

export type RemoteLinkFetchRequest = {
  address: RemoteLinkAddress
  method: 'GET' | 'HEAD'
  url: URL
}

export type RemoteLinkFetchResponse = {
  location?: string
  status: number
}

export type RemoteLinkCheckDependencies = {
  fetch?: (request: RemoteLinkFetchRequest) => Promise<RemoteLinkFetchResponse>
  maxRedirects?: number
  now?: () => Date
  resolve?: (hostname: string) => Promise<RemoteLinkAddress[]>
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function getHrefMatches(html: string) {
  return Array.from(html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))[^>]*>(.*?)<\/a>/gis))
    .map((match) => ({
      href: match[1] || match[2] || match[3] || '',
      label: match[4] || '',
    }))
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function classifyLink(href: string, seen: Set<string>): EmailLinkCheck['status'] {
  if (!href) return 'invalid'
  if (href.includes('{') && href.includes('}')) return 'merge'
  if (/^(mailto|tel):/i.test(href)) return 'ok'

  try {
    const parsed = new URL(href)
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'invalid'
    if (seen.has(href)) return 'warning'
    return 'ok'
  } catch {
    return 'invalid'
  }
}

function addLinkCheck({
  href,
  label,
  links,
  seen,
}: {
  href: string
  label: string
  links: EmailLinkCheck[]
  seen: Set<string>
}) {
  const normalizedHref = decodeEntities(href).trim()
  const status = classifyLink(normalizedHref, seen)
  if (normalizedHref) seen.add(normalizedHref)
  links.push({
    href: normalizedHref,
    label: stripTags(label || normalizedHref).slice(0, 80) || normalizedHref || 'Missing URL',
    status,
  })
}

function ipv4ToNumber(address: string) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null

  return (((octets[0] || 0) * 2 ** 24)
    + ((octets[1] || 0) * 2 ** 16)
    + ((octets[2] || 0) * 2 ** 8)
    + (octets[3] || 0)) >>> 0
}

function isInIPv4Range(address: number, base: string, prefixLength: number) {
  const baseNumber = ipv4ToNumber(base)
  if (baseNumber === null) return false
  if (prefixLength === 0) return true

  const mask = (0xffffffff << (32 - prefixLength)) >>> 0
  return (address & mask) === (baseNumber & mask)
}

function parseIPv6(address: string) {
  const normalized = address.toLowerCase()
  if (normalized.includes('%') || normalized.split('::').length > 2) return null

  let value = normalized
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':')
    if (lastColon < 0) return null
    const embedded = ipv4ToNumber(value.slice(lastColon + 1))
    if (embedded === null) return null
    value = `${value.slice(0, lastColon)}:${((embedded >>> 16) & 0xffff).toString(16)}:${(embedded & 0xffff).toString(16)}`
  }

  const [leftValue = '', rightValue = ''] = value.split('::')
  const left = leftValue ? leftValue.split(':') : []
  const right = rightValue ? rightValue.split(':') : []
  const missing = 8 - left.length - right.length
  if ((value.includes('::') && missing < 1) || (!value.includes('::') && missing !== 0)) return null

  const parts = [...left, ...Array.from({ length: Math.max(0, missing) }, () => '0'), ...right]
  if (parts.length !== 8 || parts.some((part) => !/^[\da-f]{1,4}$/.test(part))) return null

  return parts.reduce((result, part) => (result << 16n) + BigInt(`0x${part}`), 0n)
}

function ipv6Prefix(value: string, prefixLength: number) {
  const parsed = parseIPv6(value)
  if (parsed === null) throw new Error(`Invalid internal IPv6 prefix: ${value}`)
  const shift = BigInt(128 - prefixLength)
  return parsed >> shift
}

function isInIPv6Range(address: bigint, base: string, prefixLength: number) {
  const shift = BigInt(128 - prefixLength)
  return (address >> shift) === ipv6Prefix(base, prefixLength)
}

/**
 * Remote link checks are intentionally limited to globally routable addresses.
 * The denied ranges cover RFC 6890 special-use IPv4 space and IPv6 addresses
 * that are local, transition, documentation, or otherwise not global unicast.
 */
export function isPublicNetworkAddress(address: string) {
  const family = isIP(address)

  if (family === 4) {
    const value = ipv4ToNumber(address)
    if (value === null) return false

    const deniedRanges: Array<[string, number]> = [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.88.99.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ]

    return !deniedRanges.some(([base, prefixLength]) => isInIPv4Range(value, base, prefixLength))
  }

  if (family === 6) {
    const value = parseIPv6(address)
    if (value === null) return false

    // Global unicast is currently assigned from 2000::/3. Exclude special-use
    // subranges within it, including protocol assignments and documentation.
    if (!isInIPv6Range(value, '2000::', 3)) return false
    if (isInIPv6Range(value, '2001::', 23)) return false
    if (isInIPv6Range(value, '2001:db8::', 32)) return false
    if (isInIPv6Range(value, '2002::', 16)) return false
    if (isInIPv6Range(value, '3fff::', 20)) return false
    return true
  }

  return false
}

function normalizeHostname(hostname: string) {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
}

function isLocalHostname(hostname: string) {
  if (!hostname.includes('.')) return true
  return ['.localhost', '.local', '.internal', '.lan', '.home.arpa'].some((suffix) => hostname.endsWith(suffix))
}

async function resolveHostname(hostname: string): Promise<RemoteLinkAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true })
  return addresses.flatMap((entry) => entry.family === 4 || entry.family === 6
    ? [{ address: entry.address, family: entry.family }]
    : [])
}

async function fetchPinnedRemoteLink({
  address,
  method,
  url,
}: RemoteLinkFetchRequest): Promise<RemoteLinkFetchResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [address])
      return
    }
    callback(null, address.address, address.family)
  }
  const options: RequestOptions = {
    agent: false,
    headers: {
      Accept: '*/*',
      'Range': 'bytes=0-0',
      'User-Agent': 'HRO-Email-Link-Checker/1.0',
    },
    lookup,
    method,
    signal: controller.signal,
  }

  try {
    return await new Promise<RemoteLinkFetchResponse>((resolve, reject) => {
      const handleResponse = (response: IncomingMessage) => {
        resolve({
          location: response.headers.location,
          status: response.statusCode || 0,
        })
        response.destroy()
      }
      const request = url.protocol === 'https:'
        ? httpsRequest(url, options, handleResponse)
        : httpRequest(url, options, handleResponse)
      request.once('error', reject)
      request.end()
    })
  } finally {
    clearTimeout(timeout)
  }
}

function isRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}

async function prepareRemoteDestination(
  url: URL,
  resolve: NonNullable<RemoteLinkCheckDependencies['resolve']>,
) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Remote check skipped: unsupported redirect protocol.')
  if (url.username || url.password) throw new Error('Remote check skipped: URLs containing credentials are not allowed.')
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new Error('Remote check skipped: only standard web ports are allowed.')
  }

  const hostname = normalizeHostname(url.hostname)
  if (!hostname || hostname.includes('%')) throw new Error('Remote check skipped: destination hostname is not valid.')

  const literalFamily = isIP(hostname)
  if (literalFamily === 4 || literalFamily === 6) {
    if (!isPublicNetworkAddress(hostname)) {
      throw new Error('Remote check skipped: destination uses a non-public network address.')
    }
    return { address: { address: hostname, family: literalFamily as 4 | 6 }, url }
  }

  if (isLocalHostname(hostname)) {
    throw new Error('Remote check skipped: local or internal hostnames are not allowed.')
  }

  let addresses: RemoteLinkAddress[]
  try {
    addresses = await resolve(hostname)
  } catch {
    throw new Error('Remote check unavailable: DNS lookup failed.')
  }

  if (!addresses.length) throw new Error('Remote check unavailable: DNS lookup returned no addresses.')
  if (addresses.length > 16) throw new Error('Remote check skipped: DNS lookup returned an unexpected number of addresses.')
  if (addresses.some((entry) => isIP(entry.address) !== entry.family || !isPublicNetworkAddress(entry.address))) {
    throw new Error('Remote check skipped: destination DNS includes a non-public network address.')
  }

  // The approved address is passed to a custom Node lookup callback, pinning
  // the actual socket to the result that was checked above.
  return { address: addresses[0] as RemoteLinkAddress, url }
}

async function fetchWithSafeRedirects(
  initialUrl: URL,
  method: 'GET' | 'HEAD',
  dependencies: RemoteLinkCheckDependencies,
) {
  const fetchRemote = dependencies.fetch || fetchPinnedRemoteLink
  const resolve = dependencies.resolve || resolveHostname
  const requestedRedirectLimit = dependencies.maxRedirects
  const maxRedirects = Number.isInteger(requestedRedirectLimit) && Number(requestedRedirectLimit) >= 0
    ? Math.min(10, Number(requestedRedirectLimit))
    : 5
  let currentUrl = initialUrl
  let followedRedirects = 0

  while (true) {
    const destination = await prepareRemoteDestination(currentUrl, resolve)
    const response = await fetchRemote({
      address: destination.address,
      method,
      url: destination.url,
    })

    if (!isRedirectStatus(response.status) || !response.location) return response
    if (followedRedirects >= maxRedirects) {
      throw new Error(`Remote check skipped: redirect limit of ${maxRedirects} exceeded.`)
    }

    try {
      currentUrl = new URL(response.location, currentUrl)
    } catch {
      throw new Error('Remote check skipped: redirect destination is not a valid URL.')
    }
    followedRedirects += 1
  }
}

async function checkRemoteLink(
  link: EmailLinkCheck,
  dependencies: RemoteLinkCheckDependencies,
): Promise<EmailLinkCheck> {
  if (link.status === 'invalid' || link.status === 'merge' || /^(mailto|tel):/i.test(link.href)) return link

  const checkedAt = (dependencies.now || (() => new Date()))().toISOString()

  try {
    const url = new URL(link.href)
    if (!['http:', 'https:'].includes(url.protocol)) return { ...link, reason: 'Unsupported protocol', status: 'invalid' }

    let response = await fetchWithSafeRedirects(url, 'HEAD', dependencies)
    if (response.status === 405 || response.status === 403) {
      response = await fetchWithSafeRedirects(url, 'GET', dependencies)
    }

    const remoteStatus = response.status
    return {
      ...link,
      checkedAt,
      reason: remoteStatus >= 200 && remoteStatus < 400 ? undefined : `Remote check returned ${remoteStatus}`,
      remoteStatus,
      status: remoteStatus >= 200 && remoteStatus < 400 ? link.status : 'warning',
    }
  } catch (error) {
    return {
      ...link,
      checkedAt,
      reason: error instanceof Error ? error.message : 'Remote check failed',
      status: 'warning',
    }
  }
}

export async function checkRemoteEmailLinks(
  quality: EmailQualityResult,
  dependencies: RemoteLinkCheckDependencies = {},
): Promise<EmailQualityResult> {
  const uniqueChecks = new Map<string, Promise<EmailLinkCheck>>()
  const checkedLinks = await Promise.all(quality.links.map(async (link) => {
    if (link.confirmed || !link.href || link.status === 'invalid' || link.status === 'merge' || /^(mailto|tel):/i.test(link.href)) return link
    if (!uniqueChecks.has(link.href)) uniqueChecks.set(link.href, checkRemoteLink(link, dependencies))
    const checked = await uniqueChecks.get(link.href)
    return checked ? { ...link, ...checked } : link
  }))
  const remoteWarnings = checkedLinks.filter((link) => link.reason && link.status === 'warning').length
  const warnings = [...quality.warnings]

  if (remoteWarnings) {
    warnings.push(`${remoteWarnings} link${remoteWarnings === 1 ? '' : 's'} need remote review.`)
  }

  const score = Math.max(0, quality.score - remoteWarnings * 5)
  return {
    ...quality,
    label: score >= 80 ? 'Good' : score >= 60 ? 'Needs review' : 'Risky',
    links: checkedLinks,
    score,
    warnings,
  }
}

export function applyConfirmedEmailLinks(
  quality: EmailQualityResult,
  confirmations: Array<{ confirmedAt?: string; href?: string | null }> | undefined,
): EmailQualityResult {
  if (!Array.isArray(confirmations) || confirmations.length === 0) return quality

  const confirmed = new Map(
    confirmations
      .map((entry) => [decodeEntities(entry.href || '').trim(), entry.confirmedAt || new Date().toISOString()] as const)
      .filter(([href]) => href),
  )
  if (!confirmed.size) return quality

  const links = quality.links.map((link) => {
    const confirmedAt = confirmed.get(link.href)
    if (!confirmedAt || link.status === 'invalid') return link

    return {
      ...link,
      confirmed: true,
      confirmedAt,
      reason: 'Manually confirmed',
      status: 'ok' as const,
    }
  })
  const warningCount = links.filter((link) => link.status === 'warning').length
  const warnings = quality.warnings.filter((warning) => !/link.+need remote review/i.test(warning))

  if (warningCount) {
    warnings.push(`${warningCount} link${warningCount === 1 ? '' : 's'} need remote review.`)
  }

  const score = Math.min(100, quality.score + (quality.links.filter((link) => confirmed.has(link.href) && link.status === 'warning').length * 5))

  return {
    ...quality,
    label: score >= 80 ? 'Good' : score >= 60 ? 'Needs review' : 'Risky',
    links,
    score,
    warnings,
  }
}

export function inspectEmailQuality({
  declaredLinks = [],
  hasAddress,
  hasUnsubscribeLink,
  html,
  subject,
  text,
}: {
  declaredLinks?: DeclaredEmailLink[]
  hasAddress: boolean
  hasUnsubscribeLink: boolean
  html: string
  subject: string
  text: string
}): EmailQualityResult {
  const warnings: string[] = []
  const plainText = stripTags(text || html)
  const links: EmailLinkCheck[] = []
  const seen = new Set<string>()
  const subjectUpperRatio = subject ? subject.replace(/[^A-Z]/g, '').length / Math.max(1, subject.replace(/[^A-Za-z]/g, '').length) : 0

  if (!subject) warnings.push('Subject is missing.')
  if (subjectUpperRatio > 0.7 && subject.length > 12) warnings.push('Subject uses heavy capitalization.')
  if (/[!?]{3,}/.test(subject)) warnings.push('Subject uses repeated punctuation.')
  if (/\b(free|guarantee|urgent|act now|limited time|winner|cash|risk free)\b/i.test(`${subject} ${plainText}`)) {
    warnings.push('Spam-sensitive wording is present.')
  }
  if (plainText.length < 250) warnings.push('Email has very little readable text.')
  if (!hasAddress) warnings.push('Physical mailing address is missing.')
  if (!hasUnsubscribeLink) warnings.push('Email preferences/unsubscribe link is missing.')

  const imageCount = (html.match(/<img\b/gi) || []).length
  if (imageCount >= 3 && plainText.length < 600) warnings.push('Email may be image-heavy compared with text.')
  if (/<img\b(?![^>]*\balt=)/i.test(html)) warnings.push('At least one image is missing alt text.')

  for (const match of getHrefMatches(html)) {
    addLinkCheck({
      href: match.href,
      label: match.label,
      links,
      seen,
    })
  }

  for (const link of declaredLinks) {
    const href = decodeEntities(link.href).trim()
    if (href && seen.has(href)) continue
    addLinkCheck({
      href,
      label: link.label,
      links,
      seen,
    })
  }

  const invalidLinks = links.filter((link) => link.status === 'invalid').length
  const duplicateLinks = links.filter((link) => link.status === 'warning').length
  if (invalidLinks) warnings.push(`${invalidLinks} malformed link${invalidLinks === 1 ? '' : 's'} found.`)
  if (duplicateLinks) warnings.push(`${duplicateLinks} duplicate link${duplicateLinks === 1 ? '' : 's'} found.`)
  if (links.length > 15) warnings.push('Email contains a high number of links.')

  const score = Math.max(0, 100 - warnings.length * 10 - invalidLinks * 8 - duplicateLinks * 3)
  const label = score >= 80 ? 'Good' : score >= 60 ? 'Needs review' : 'Risky'

  return { label, links, score, warnings }
}
