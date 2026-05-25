export type EmailLinkCheck = {
  href: string
  label: string
  status: 'invalid' | 'merge' | 'ok' | 'warning'
}

export type EmailQualityResult = {
  label: 'Good' | 'Needs review' | 'Risky'
  links: EmailLinkCheck[]
  score: number
  warnings: string[]
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function getHrefMatches(html: string) {
  return Array.from(html.matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>(.*?)<\/a>/gis))
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

export function inspectEmailQuality({
  hasAddress,
  hasUnsubscribeLink,
  html,
  subject,
  text,
}: {
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
    const href = decodeEntities(match[2] || '').trim()
    const status = classifyLink(href, seen)
    if (href) seen.add(href)
    links.push({
      href,
      label: stripTags(match[3] || href).slice(0, 80) || href,
      status,
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
