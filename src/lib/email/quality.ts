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

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  if (['localhost', '0.0.0.0'].includes(normalized) || normalized.endsWith('.local')) return true
  if (normalized === '::1') return true
  if (/^127\./.test(normalized)) return true
  if (/^10\./.test(normalized)) return true
  if (/^192\.168\./.test(normalized)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true
  return false
}

async function fetchWithTimeout(url: string, method: 'GET' | 'HEAD') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkRemoteLink(link: EmailLinkCheck): Promise<EmailLinkCheck> {
  if (link.status === 'invalid' || link.status === 'merge' || /^(mailto|tel):/i.test(link.href)) return link

  try {
    const url = new URL(link.href)
    if (!['http:', 'https:'].includes(url.protocol)) return { ...link, reason: 'Unsupported protocol', status: 'invalid' }
    if (isPrivateHostname(url.hostname)) return { ...link, reason: 'Private/internal host skipped', status: 'warning' }

    let res = await fetchWithTimeout(url.toString(), 'HEAD')
    if (res.status === 405 || res.status === 403) {
      res = await fetchWithTimeout(url.toString(), 'GET')
    }

    const remoteStatus = res.status
    return {
      ...link,
      checkedAt: new Date().toISOString(),
      reason: remoteStatus >= 200 && remoteStatus < 400 ? undefined : `Remote check returned ${remoteStatus}`,
      remoteStatus,
      status: remoteStatus >= 200 && remoteStatus < 400 ? link.status : 'warning',
    }
  } catch (error) {
    return {
      ...link,
      checkedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : 'Remote check failed',
      status: 'warning',
    }
  }
}

export async function checkRemoteEmailLinks(quality: EmailQualityResult): Promise<EmailQualityResult> {
  const uniqueChecks = new Map<string, Promise<EmailLinkCheck>>()
  const checkedLinks = await Promise.all(quality.links.map(async (link) => {
    if (link.confirmed || !link.href || link.status === 'invalid' || link.status === 'merge' || /^(mailto|tel):/i.test(link.href)) return link
    if (!uniqueChecks.has(link.href)) uniqueChecks.set(link.href, checkRemoteLink(link))
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
