import { APIError } from 'payload'
const API = 'https://api.tinyurl.com'
export class TinyURLError extends APIError {
  constructor(message: string, status = 400) {
    super(message, status, undefined, true)
  }
}
export type RemoteLink = {
  domain: string
  alias: string
  url: string
  archived?: boolean
  tiny_url?: string
}
type Envelope = {
  code?: number
  data?: unknown
  links?: { next?: string | null }
  meta?: { current_page?: number; last_page?: number }
  next_page_url?: string | null
}
export function domainValue(value: unknown): string {
  if (typeof value !== 'string')
    throw new TinyURLError('Configure the site’s existing TinyURL domain in Site Profile first.')
  const domain = value.trim().toLowerCase()
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))
    throw new TinyURLError('Enter a domain name without a protocol, port or path.')
  return domain
}
export function aliasValue(value: unknown, domain: string): string {
  const alias = typeof value === 'string' ? value.trim() : ''
  const min = domain === 'tinyurl.com' ? 5 : 1
  if (alias.length < min || alias.length > 30 || !/^[a-zA-Z0-9_-]+$/.test(alias))
    throw new TinyURLError(`Alias must be ${min}–30 letters, numbers, underscores or hyphens.`)
  return alias
}
export function destinationValue(value: unknown): string {
  try {
    if (typeof value !== 'string') throw new Error()
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error()
    // Preview and draft access credentials must never be sent to the shortening provider.
    if (
      /\/(?:api\/)?(?:preview|draft-share)(?:\/|$)/i.test(url.pathname) ||
      [...url.searchParams.keys()].some((key) =>
        /^(token|secret|api[_-]?key|access[_-]?token)$/i.test(key),
      )
    )
      throw new Error()
    return url.href
  } catch {
    throw new TinyURLError(
      'Enter a public HTTP(S) destination without credentials or draft/preview tokens.',
    )
  }
}
export class TinyURLClient {
  constructor(
    private token = process.env.TINYURL_API_TOKEN,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(path: string, method = 'GET', body?: unknown): Promise<Envelope> {
    if (!this.token)
      throw new TinyURLError(
        'TinyURL is not configured on the server. Contact the site maintainer.',
        503,
      )
    try {
      const response = await this.transport(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      })
      const result = (await response.json()) as Envelope
      if (response.status === 404 || result.code === 6)
        throw new TinyURLError('TinyURL link was not found.', 404)
      if (!response.ok || (result.code !== undefined && result.code !== 0)) {
        // Do not echo provider errors: they can contain submitted URLs, tokens or account details.
        const message =
          response.status === 429
            ? 'TinyURL rate limit reached. Retry later.'
            : response.status === 401 ||
                response.status === 403 ||
                result.code === 1 ||
                result.code === 3 ||
                result.code === 4
              ? 'TinyURL credentials or domain permissions need attention.'
              : response.status === 422 || result.code === 5
                ? 'TinyURL rejected the alias or destination. The alias may already be taken.'
                : 'TinyURL could not complete the request. Retry later.'
        throw new TinyURLError(message, response.status >= 400 ? response.status : 400)
      }
      return result
    } catch (error) {
      if (error instanceof TinyURLError) throw error
      throw new TinyURLError('TinyURL did not return a valid response. Retry later.', 502)
    }
  }
  async get(domain: string, alias: string): Promise<RemoteLink | null> {
    try {
      return this.link(
        (await this.request(`/alias/${encodeURIComponent(domain)}/${encodeURIComponent(alias)}`))
          .data,
        domain,
      )
    } catch (error) {
      if (error instanceof TinyURLError && error.status === 404) return null
      throw error
    }
  }
  private link(data: unknown, domain: string): RemoteLink {
    const link = data as RemoteLink | undefined
    if (
      !link ||
      link.domain !== domain ||
      typeof link.alias !== 'string' ||
      typeof link.url !== 'string'
    )
      throw new TinyURLError('TinyURL returned unexpected link data.', 502)
    return link
  }
  async create(domain: string, alias: string, url: string): Promise<void> {
    await this.request('/create', 'POST', { domain, alias, url })
  }
  async change(domain: string, alias: string, url: string): Promise<void> {
    await this.request('/change', 'PATCH', { domain, alias, url })
  }
  async rename(domain: string, alias: string, next: string): Promise<void> {
    await this.request('/update', 'PATCH', { domain, alias, new_alias: next })
  }
  async *list(domain: string): AsyncGenerator<RemoteLink> {
    for (const type of ['available', 'archived']) {
      let path: string | null = `/urls/${type}`
      const visited = new Set<string>()
      while (path) {
        if (visited.has(path))
          throw new TinyURLError(
            'TinyURL repeated a pagination cursor. Import stopped; retry later.',
            502,
          )
        visited.add(path)
        const page = await this.request(path)
        if (!Array.isArray(page.data))
          throw new TinyURLError('TinyURL returned an unsupported list response.', 502)
        for (const item of page.data) {
          if (item?.domain === domain)
            yield { ...this.link(item, domain), archived: type === 'archived' }
        }
        const next = page.links?.next ?? page.next_page_url
        if (next) {
          const url = new URL(next, API)
          if (url.origin !== API || url.pathname !== `/urls/${type}`)
            throw new TinyURLError('TinyURL returned an unsafe pagination link.', 502)
          path = `${url.pathname}${url.search}`
        } else if (
          page.meta?.current_page &&
          page.meta.last_page &&
          page.meta.current_page < page.meta.last_page
        ) {
          path = `/urls/${type}?page=${page.meta.current_page + 1}`
        } else path = null
      }
    }
  }
}
