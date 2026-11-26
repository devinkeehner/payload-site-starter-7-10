'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PuckBlockSchema } from '@/lib/puck/types'
import { findBlockSchema, type SlotDescriptor } from '@/lib/live-editor/document'
import { relationshipId, type RelationshipOption } from '@/lib/live-editor/relationships'
import { liveEmailOptionsURL } from './LiveEmailResourceContext'
import { mapLiveEmailFields } from './LiveEmailBlockRenderer'

function hasMediaURL(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'url' in value && value.url)
}

function collectLiveEmailMedia(slots: SlotDescriptor[], schemas: PuckBlockSchema[]) {
  const referenced = new Set<string>()
  const populated = new Map<string, unknown>()
  for (const slot of slots) {
    if (slot.active === false) continue
    for (const block of slot.items) {
      mapLiveEmailFields(block, findBlockSchema(block.blockType, schemas), (owner, field) => {
        const value = owner[field.name]
        if (field.type === 'upload' && field.relationTo === 'media') {
          for (const item of field.hasMany && Array.isArray(value) ? value : [value]) {
            const id = relationshipId(item)
            if (id) {
              if (hasMediaURL(item)) populated.set(id, item)
              else referenced.add(id)
            }
          }
        }
        return value
      })
    }
  }
  return { referenced, populated }
}

export function useLiveEmailMedia(apiURL: string | undefined, slots: SlotDescriptor[], schemas: PuckBlockSchema[]) {
  const [cache, setCache] = useState<{ apiURL: typeof apiURL; resources: Map<string, unknown> }>()
  const resources = cache?.apiURL === apiURL ? cache?.resources : undefined
  const { referenced, populated } = useMemo(() => collectLiveEmailMedia(slots, schemas), [slots, schemas])
  const missing = JSON.stringify(Array.from(referenced).filter(id => !populated.has(id) && !resources?.has(id)).sort())

  useEffect(() => {
    const ids: string[] = JSON.parse(missing)
    if (apiURL == null || ids.length === 0) return
    const controller = new AbortController()
    // The tenant-scoped options endpoint accepts at most 100 IDs per request.
    const requests = []
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100)
      const url = liveEmailOptionsURL(apiURL, new URLSearchParams({ collection: 'media', ids: batch.join(',') }))
      requests.push(fetch(url, { credentials: 'same-origin', signal: controller.signal }).then(async response => {
        if (!response.ok) return
        const { options = [] } = await response.json() as { options?: RelationshipOption[] }
        return { batch, options }
      }).catch(() => undefined))
    }
    void Promise.all(requests).then(results => {
      const loaded = results.filter(result => result !== undefined)
      if (controller.signal.aborted || loaded.length === 0) return
      setCache(previous => {
        const next = new Map(previous?.apiURL === apiURL ? previous?.resources : undefined)
        for (const { batch, options } of loaded) {
          for (const option of options) next.set(String(option.value), option.resource ?? null)
          // Avoid requesting deleted or inaccessible references again on every edit.
          for (const id of batch) if (!next.has(id)) next.set(id, null)
        }
        return { apiURL, resources: next }
      })
    })
    return () => controller.abort()
  }, [apiURL, missing])

  return (value: unknown) => {
    if (hasMediaURL(value)) return value
    const id = relationshipId(value)
    return id ? populated.get(id) ?? resources?.get(id) ?? value : value
  }
}
