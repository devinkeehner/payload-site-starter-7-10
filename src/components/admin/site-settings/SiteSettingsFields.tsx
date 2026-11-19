'use client'

import { useDocumentInfo, useFormFields, useRowLabel } from '@payloadcms/ui'
import { createContext, useContext } from 'react'
import styles from './site-settings.module.scss'

export function TownRowLabel() {
  const { data, rowNumber } = useRowLabel<{ town?: string }>()
  return <span>{data?.town?.trim() || `Town ${(rowNumber ?? 0) + 1}`}</span>
}

export const SiteSettingsWebsiteContext = createContext<string | null>(null)

export function HomepageSearchPreview() {
  const title = useFormFields(([fields]) => fields.title?.value)
  const description = useFormFields(([fields]) => fields.description?.value)
  const { id } = useDocumentInfo()
  const website = useContext(SiteSettingsWebsiteContext)
  if (!id || (typeof title !== 'string' && typeof description !== 'string')) return null

  return (
    <section className={styles.searchPreview} aria-label="Homepage search preview">
      <h3>Search result preview</h3>
      {website && <span>{website.replace(/^https?:\/\//, '')}</span>}
      <p>{typeof title === 'string' && title.trim() ? title : 'Homepage title'}</p>
      <small>
        {typeof description === 'string' && description.trim()
          ? description
          : 'Add a homepage description.'}
      </small>
    </section>
  )
}
