export type CoalescedSaveQueue<T> = {
  flush: () => Promise<void>
  getSavedVersion: () => number
  isDirty: () => boolean
  update: (snapshot: T, version: number) => void
}

/**
 * Serializes whole-document saves and keeps only the newest snapshot waiting
 * behind an in-flight request. A flush does not resolve until every revision
 * known to the queue has been persisted.
 */
export function createCoalescedSaveQueue<T>(
  persist: (snapshot: T, version: number) => Promise<void>,
): CoalescedSaveQueue<T> {
  let latest: { snapshot: T; version: number } | null = null
  let running: Promise<void> | null = null
  let savedVersion = 0

  async function drain() {
    while (latest && latest.version > savedVersion) {
      const target = latest
      await persist(target.snapshot, target.version)
      savedVersion = target.version
    }
  }

  async function flush() {
    do {
      if (!running) {
        const task = drain()
        running = task
        void task.finally(() => {
          if (running === task) running = null
        }).catch(() => {
          // The caller receives the original rejection from `await task`.
        })
      }

      await running
    } while (latest && latest.version > savedVersion)
  }

  return {
    flush,
    getSavedVersion: () => savedVersion,
    isDirty: () => Boolean(latest && latest.version > savedVersion),
    update(snapshot, version) {
      if (version <= savedVersion || (latest && version < latest.version)) return
      latest = { snapshot, version }
    },
  }
}
