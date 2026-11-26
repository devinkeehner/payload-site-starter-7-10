import { useCallback, useEffect, useState } from 'react'
import type { SectionTemplate } from '@/lib/live-editor/pageSections'

export function usePageSectionLibrary(apiURL: string | undefined) {
  const [sections, setSections] = useState<SectionTemplate[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!apiURL) return
    const controller = new AbortController()
    void fetch(`${apiURL}/sections`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('The saved sections could not be loaded.')
        const result = await response.json() as { sections: SectionTemplate[] }
        if (controller.signal.aborted) return
        setSections(current => [...current, ...result.sections.filter(section => !current.some(item => item.id === section.id))])
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [apiURL])

  const save = useCallback(async (name: string, section: SectionTemplate['section']) => {
    if (!apiURL) throw new Error('Open a saved page to use the section library.')
    const response = await fetch(`${apiURL}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, section }),
    })
    const result = await response.json() as { error?: string; template?: SectionTemplate }
    if (!response.ok || !result.template) throw new Error(result.error || 'The section could not be saved.')
    const template = result.template
    setSections(current => [template, ...current.filter(item => item.id !== template.id)])
    return template
  }, [apiURL])

  return { sections, save, error }
}
