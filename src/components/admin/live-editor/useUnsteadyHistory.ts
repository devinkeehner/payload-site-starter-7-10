'use client'

import { useCallback, useRef, useState } from 'react'

/** Immutable native-page snapshots. Text bursts coalesce; structural commands stay atomic. */
export function useUnsteadyHistory<T>(initial: T) {
  const stack = useRef({ entries: [initial], index: 0, key: '', timestamp: 0 })
  const [value, setValue] = useState(initial)
  const [revision, setRevision] = useState(0)
  const version = useRef(0)
  const commit = useCallback((next: T | ((current: T) => T), key = '') => {
    const history = stack.current
    const current = history.entries[history.index]!
    const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next
    if (JSON.stringify(resolved) === JSON.stringify(current)) return
    const now = Date.now()
    const coalesce = key && history.key === key && now - history.timestamp < 700 && history.index > 0 && history.index === history.entries.length - 1
    const entries = history.entries.slice(0, history.index + (coalesce ? 0 : 1))
    entries.push(resolved)
    if (entries.length > 100) entries.shift()
    stack.current = { entries, index: entries.length - 1, key, timestamp: now }
    setValue(resolved)
    setRevision(++version.current)
  }, [])
  const travel = useCallback((delta: number) => {
    const history = stack.current
    const index = Math.max(0, Math.min(history.entries.length - 1, history.index + delta))
    if (index === history.index) return
    stack.current = { ...history, index, key: '', timestamp: 0 }
    setValue(history.entries[index]!)
    setRevision(++version.current)
  }, [])
  const reset = useCallback((next: T) => {
    stack.current = { entries: [next], index: 0, key: '', timestamp: 0 }
    setValue(next)
    setRevision(++version.current)
  }, [])
  return { value, commit, reset, getCurrent: useCallback(() => ({ document: stack.current.entries[stack.current.index]!, revision: version.current }), []), undo: useCallback(() => travel(-1), [travel]), redo: useCallback(() => travel(1), [travel]), canUndo: stack.current.index > 0, canRedo: stack.current.index < stack.current.entries.length - 1, revision }
}
