/** Report the failed operation and HTTP status without surfacing server HTML, stacks or signed URLs. */
export async function readGraphicResponse<T = unknown>(
  response: Response,
  operation: string,
): Promise<T> {
  if (!response.ok) {
    const advice =
      response.status === 401
        ? ' Sign in again and retry.'
        : response.status === 403
          ? ' Your account may not have access to this site or action.'
          : response.status === 413
            ? ' The exported image is too large to upload.'
            : response.status >= 500
              ? ' The server is unavailable; try again shortly.'
              : ''
    throw new Error(`${operation} failed (HTTP ${response.status}).${advice}`)
  }
  try {
    return (await response.json()) as T
  } catch {
    throw new Error(
      `${operation} returned an unexpected response. Sign in again if your session expired.`,
    )
  }
}

export async function fetchGraphic(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(30_000) })
  } catch (error) {
    if (init?.signal?.aborted) throw error
    const path = new URL(input, 'https://editor.invalid').pathname
    const operation =
      path === '/api/media/upload'
        ? 'Media Gallery upload'
        : path.startsWith('/api/posts/')
          ? 'Post SEO request'
          : path.startsWith('/api/graphic-templates')
            ? 'Graphic template request'
            : path.startsWith('/api/graphic-designs')
              ? 'Design draft request'
              : 'Editor request'
    throw new Error(`${operation} could not connect. Check your connection and try again.`)
  }
}
