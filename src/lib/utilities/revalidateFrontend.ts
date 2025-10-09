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
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ secret, paths, tags }),
    })
  } catch (error) {
    console.error('Failed to trigger frontend revalidation', error)
  }
}
