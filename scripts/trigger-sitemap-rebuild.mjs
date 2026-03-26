const DEFAULT_RETRY_COUNT = 8
const DEFAULT_RETRY_DELAY_MS = 5000
const DEFAULT_TIMEOUT_MS = 30000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getBaseURL() {
  const candidates = [
    process.env.SITEMAP_REBUILD_BASE_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.NEXT_PUBLIC_SERVER_URL,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.replace(/\/+$/, '')
    }
  }

  throw new Error(
    'Missing sitemap rebuild base URL. Set SITEMAP_REBUILD_BASE_URL, RENDER_EXTERNAL_URL, or NEXT_PUBLIC_SERVER_URL.',
  )
}

function getSecret() {
  const candidates = [
    process.env.SITEMAP_REBUILD_SECRET,
    process.env.CRON_SECRET,
    process.env.PAYLOAD_SECRET,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  throw new Error(
    'Missing sitemap rebuild secret. Set SITEMAP_REBUILD_SECRET, CRON_SECRET, or PAYLOAD_SECRET.',
  )
}

async function main() {
  const baseURL = getBaseURL()
  const secret = getSecret()
  const retryCount = Number.parseInt(process.env.SITEMAP_REBUILD_RETRIES || '', 10) || DEFAULT_RETRY_COUNT
  const retryDelayMs =
    Number.parseInt(process.env.SITEMAP_REBUILD_RETRY_DELAY_MS || '', 10) || DEFAULT_RETRY_DELAY_MS
  const timeoutMs = Number.parseInt(process.env.SITEMAP_REBUILD_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS
  const url = `${baseURL}/api/sitemaps/rebuild`

  let lastError = null

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      console.log(`[sitemaps] rebuild attempt ${attempt}/${retryCount}: ${url}`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const text = await response.text()

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      console.log('[sitemaps] rebuild succeeded')
      if (text) console.log(text)
      return
    } catch (error) {
      clearTimeout(timeout)
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[sitemaps] rebuild attempt ${attempt} failed: ${message}`)

      if (attempt < retryCount) {
        await sleep(retryDelayMs)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

main().catch((error) => {
  console.error('[sitemaps] rebuild failed permanently')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
