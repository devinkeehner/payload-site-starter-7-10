type FlushMessageSettings = () => Promise<boolean>

const flushers = new Map<string, FlushMessageSettings>()

export function registerEmailComposeSettingsFlusher(
  emailId: string,
  flush: FlushMessageSettings,
) {
  flushers.set(emailId, flush)
  return () => {
    if (flushers.get(emailId) === flush) flushers.delete(emailId)
  }
}

export async function flushEmailComposeSettings(emailId: string) {
  return (await flushers.get(emailId)?.()) ?? true
}
