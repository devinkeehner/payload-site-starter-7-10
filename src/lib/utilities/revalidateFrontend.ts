interface RevalidateArgs {
  paths?: string[]
  tags?: string[]
}

export async function triggerFrontendRevalidate({ paths = [], tags = [] }: RevalidateArgs): Promise<void> {
  const url = process.env.FRONTEND_REVALIDATE_URL
  const secret = process.env.REVALIDATE_SECRET

  if (!url || !secret) {
    return
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ secret, paths, tags }),
    })

    if (!response.ok) {
      console.error('Frontend revalidation returned non-OK response', {
        status: response.status,
        statusText: response.statusText,
      })
    }
  } catch (error) {
    console.error('Failed to trigger frontend revalidation', error)
  }
}
