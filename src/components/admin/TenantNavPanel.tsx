'use client'

import React, { useCallback, useMemo, useState } from 'react'
import {
  ConfirmationModal,
  Translation,
  useAuth,
  useModal,
  useTranslation,
} from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import TenantDropdown from './TenantDropdown'

type TenantOption = {
  label: string
  value: string
}

const confirmSwitchTenantSlug = 'assigned-tenant-switch'
const confirmLeaveWithoutSavingSlug = 'assigned-tenant-leave-without-saving'

const normalizeOption = (option: any): TenantOption => ({
  label: typeof option?.label === 'string' ? option.label : String(option?.label ?? ''),
  value: String(option?.value ?? ''),
})

const TenantNavPanel: React.FC = () => {
  const { entityType, modified, options = [], selectedTenantID, setTenant } = useTenantSelection()
  const { user } = useAuth()
  const { openModal, closeModal } = useModal()
  const { t } = useTranslation()

  const translate = useMemo(() => t as unknown as (key: string, options?: Record<string, unknown>) => string, [t])
  const [tenantSelection, setTenantSelection] = useState<TenantOption | undefined>(undefined)

  const assignedOptions = useMemo(() => {
    if (!Array.isArray(options) || !options.length) return []

    const normalized = (options as any[]).map(normalizeOption)

    const assignedIDs = new Set<string>()
    if (Array.isArray(user?.tenants)) {
      user.tenants.forEach((assignment: any) => {
        const relation = assignment?.tenant
        if (!relation) return
        if (typeof relation === 'string') {
          assignedIDs.add(relation)
        } else if (typeof relation === 'object') {
          const relationID = relation?.id ?? relation?.value
          if (typeof relationID === 'string') assignedIDs.add(relationID)
        }
      })
    }

    if (!assignedIDs.size) return []

    return normalized.filter((option) => assignedIDs.has(option.value))
  }, [options, user])

  const switchTenant = useCallback(
    (option?: TenantOption) => {
      if (option && option.value) {
        setTenant({ id: option.value, refresh: true })
      } else {
        setTenant({ id: undefined, refresh: true })
      }
    },
    [setTenant],
  )

  const handleSelection = useCallback(
    (candidate: TenantOption) => {
      if (candidate.value === selectedTenantID) return

      if (entityType !== 'document') {
        if (entityType === 'global' && modified) {
          setTenantSelection(candidate)
          openModal(confirmLeaveWithoutSavingSlug)
        } else {
          switchTenant(candidate)
        }
      } else {
        setTenantSelection(candidate)
        openModal(confirmSwitchTenantSlug)
      }
    },
    [entityType, modified, openModal, selectedTenantID, switchTenant],
  )

  const selectedValue = useMemo(() => {
    if (!selectedTenantID) return undefined
    return assignedOptions.find((option) => option.value === selectedTenantID)
  }, [assignedOptions, selectedTenantID])

  const pendingSelection = tenantSelection
    ? assignedOptions.find((option) => option.value === tenantSelection.value)
    : undefined

  if (!assignedOptions.length) return null

  return (
    <div
      className="tenant-nav-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '0.25rem', width: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--theme-elevation-600)',
          }}
        >
          My Sites
        </span>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          {assignedOptions.map((option) => {
            const isActive = selectedTenantID === option.value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => handleSelection(option)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.25rem',
                    border: 'none',
                    borderRadius: '0.35rem',
                    background: isActive ? 'var(--theme-elevation-50)' : 'transparent',
                    color: 'var(--theme-text)',
                    fontSize: '0.9rem',
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '0.4rem',
                      height: '0.4rem',
                      borderRadius: '999px',
                      background: isActive ? 'var(--theme-text)' : 'transparent',
                      border: '1px solid var(--theme-elevation-300)',
                    }}
                  />
                  <span style={{ flex: 1, textAlign: 'left' }}>{option.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div style={{ borderTop: '1px solid var(--theme-elevation-150)', paddingTop: '0.75rem' }}>
        <TenantDropdown />
      </div>

      <ConfirmationModal
        body={
          <Translation
            elements={{
              0: ({ children }) => <b>{children}</b>,
            }}
            i18nKey={'plugin-multi-tenant:confirm-tenant-switch--body' as any}
            t={translate as any}
            variables={{
              fromTenant: selectedValue?.label,
              toTenant: pendingSelection?.label,
            }}
          />
        }
        heading={translate('plugin-multi-tenant:confirm-tenant-switch--heading', {
          tenantLabel: 'Tenant',
        })}
        modalSlug={confirmSwitchTenantSlug}
        onConfirm={() => switchTenant(tenantSelection)}
      />

      <ConfirmationModal
        body={translate('general:changesNotSaved')}
        cancelLabel={translate('general:stayOnThisPage')}
        confirmLabel={translate('general:leaveAnyway')}
        heading={translate('general:leaveWithoutSaving')}
        modalSlug={confirmLeaveWithoutSavingSlug}
        onCancel={() => closeModal(confirmLeaveWithoutSavingSlug)}
        onConfirm={() => switchTenant(tenantSelection)}
      />
    </div>
  )
}

export default TenantNavPanel
