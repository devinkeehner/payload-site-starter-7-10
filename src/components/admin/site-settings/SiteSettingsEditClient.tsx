'use client'

import { DefaultEditView, Gutter, SaveButton, useFormModified } from '@payloadcms/ui'
import type { DocumentViewClientProps } from 'payload'
import { useEffect, useRef } from 'react'
import {
  clearAdminUnsavedChanges,
  setAdminUnsavedChanges,
} from '@/components/admin/adminUnsavedChanges'
import { SiteSettingsLayout, type SiteSettingsLayoutProps } from './SiteSettingsLayout'
import { SiteSettingsWebsiteContext } from './SiteSettingsFields'
import styles from './site-settings.module.scss'

function TrackSettingsEdits() {
  const modified = useFormModified()
  useEffect(() => {
    setAdminUnsavedChanges('site-settings', modified)
    return () => clearAdminUnsavedChanges('site-settings')
  }, [modified])
  return null
}

export function SiteSettingsEditClient({
  layout,
  native,
  related,
}: {
  layout: SiteSettingsLayoutProps
  native: DocumentViewClientProps
  related?: { href: string; label: string }
}) {
  const form = useRef<HTMLDivElement>(null)
  const tabLabel = 'tab' in layout.section ? layout.section.tab : undefined

  useEffect(() => {
    const root = form.current
    if (!root || !tabLabel) return

    // Keep Payload's native tab and field state. Tab preferences can load
    // after mount, so apply the section until a user chooses a validation tab.
    let manuallySelected = false
    const openTab = () => {
      if (manuallySelected) return
      const buttons = Array.from(
        root.querySelectorAll<HTMLButtonElement>('.hro-profile-tabs .tabs-field__tab-button'),
      )
      const target = buttons.find((button) => button.textContent?.trim().startsWith(tabLabel))
      if (target && !target.classList.contains('tabs-field__tab-button--active')) target.click()
    }
    const allowValidationTab = (event: Event) => {
      if (
        event.isTrusted &&
        event.target instanceof Element &&
        event.target.closest('.tabs-field__tab-button')
      ) {
        manuallySelected = true
      }
    }
    const observer = new MutationObserver(openTab)
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    root.addEventListener('click', allowValidationTab, true)
    openTab()
    return () => {
      observer.disconnect()
      root.removeEventListener('click', allowValidationTab, true)
    }
  }, [tabLabel])

  return (
    <>
      <Gutter>
        <SiteSettingsLayout {...layout}>
          {related && (
            <a className={styles.related} href={related.href}>
              {related.label} →
            </a>
          )}
        </SiteSettingsLayout>
      </Gutter>
      <SiteSettingsWebsiteContext.Provider value={layout.site?.website ?? null}>
        <div ref={form} className={styles.nativeForm}>
          <DefaultEditView
            {...native}
            BeforeDocumentControls={
              <>
                {native.BeforeDocumentControls}
                <TrackSettingsEdits />
              </>
            }
            SaveButton={<SaveButton label={layout.section.save} />}
          />
        </div>
      </SiteSettingsWebsiteContext.Provider>
    </>
  )
}
