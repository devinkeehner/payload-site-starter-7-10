const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])

export function sectionYouTubeEmbed(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.trim()) return
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return
    const [, route, segment, extra] = url.pathname.split('/')
    const id = url.hostname === 'youtu.be' && !segment ? route
      : youtubeHosts.has(url.hostname) && route === 'watch' && !segment ? url.searchParams.get('v')
      : youtubeHosts.has(url.hostname) && ['embed', 'shorts', 'live'].includes(route ?? '') && !extra ? segment
      : undefined
    if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`
  } catch { return }
}

/** CMS filenames routinely contain spaces. Normalize the URL before rendering it. */
export function sectionMediaURL(input: unknown): string | undefined {
  if (typeof input !== 'string' || /[\x00-\x1f\x7f\\]/.test(input)) return
  try {
    if (/^\/(?!\/)/.test(input)) {
      const url = new URL(input, 'https://media.invalid')
      return url.pathname + url.search + url.hash
    }
    const url = new URL(input)
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) return url.href
  } catch { return }
}
