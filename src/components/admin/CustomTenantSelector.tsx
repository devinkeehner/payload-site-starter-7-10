'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ConfirmationModal,
  SelectInput,
  Translation,
  useAuth,
  useModal,
  useTranslation,
} from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

type TenantOption = {
  label: string
  value: string
  isDivider?: boolean
  isDisabled?: boolean
}

type Props = {
  label?: React.ReactNode
  viewType?: 'list' | 'default'
}

const confirmSwitchTenantSlug = 'confirm-switch-tenant'
const confirmLeaveWithoutSavingSlug = 'confirm-leave-without-saving'

const createDividerOption = (label: string): TenantOption => ({
  label,
  value: `__divider__:${label}`,
  isDivider: true,
  isDisabled: true,
})

const normalizeOption = (option: any): TenantOption => ({
  label: typeof option?.label === 'string' ? option.label : String(option?.label ?? ''),
  value: String(option?.value ?? ''),
  isDivider: Boolean(option?.isDivider),
  isDisabled: Boolean(option?.isDisabled),
})

const isDividerOption = (option?: TenantOption | null) => Boolean(option?.isDivider)

const CustomTenantSelector: React.FC<Props> = ({ label, viewType }) => {
  const { entityType, modified, options = [], selectedTenantID, setTenant } = useTenantSelection()
  const { closeModal, openModal } = useModal()
  const { t } = useTranslation()
  const { user } = useAuth()

  const translate = useMemo(() => t as unknown as (key: string, options?: Record<string, unknown>) => string, [t])
  const [tenantSelection, setTenantSelection] = useState<TenantOption | undefined>(undefined)
  const [isHydrated, setIsHydrated] = useState(false)

  const { assignedOptions, otherOptions, allOptions } = useMemo(() => {
    const normalized = (options as any[]).map(normalizeOption)
    normalized.sort((a, b) => a.label.localeCompare(b.label))

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

    const assigned: TenantOption[] = []
    const remaining: TenantOption[] = []

    normalized.forEach((option) => {
      if (assignedIDs.has(option.value)) {
        assigned.push(option)
      } else {
        remaining.push(option)
      }
    })

    return {
      assignedOptions: assigned,
      otherOptions: remaining,
      allOptions: normalized,
    }
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
    (candidate?: TenantOption) => {
      if (candidate && candidate.value === selectedTenantID) return

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
    return allOptions.find((option) => option.value === selectedTenantID)
  }, [allOptions, selectedTenantID])

  const pendingSelection = tenantSelection && !isDividerOption(tenantSelection)
    ? allOptions.find((option) => option.value === tenantSelection.value)
    : undefined

  const [searchTerm, setSearchTerm] = useState('')

  const filterOptions = useCallback(
    (list: TenantOption[]) => {
      if (!searchTerm.trim()) return list
      const query = searchTerm.trim().toLowerCase()
      return list.filter((option) => option.label.toLowerCase().includes(query))
    },
    [searchTerm],
  )

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const filteredAssigned = filterOptions(assignedOptions)
  const filteredOthers = filterOptions(otherOptions)

  if (!isHydrated) return null
  if (!allOptions.length) return null

  return (
    <div className="tenant-selector" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label
          htmlFor="tenant-selector-search"
          style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.75 }}
        >
          {typeof label === 'string' ? label : 'Select Site'}
        </label>
        <input
          id="tenant-selector-search"
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search sites"
          style={{
            width: '100%',
            padding: '0.45rem 0.65rem',
            borderRadius: '999px',
            border: '1px solid var(--theme-elevation-150)',
            background: 'var(--theme-elevation-0)',
            color: 'var(--theme-text)',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxHeight: '16.5rem',
          overflowY: 'auto',
          paddingRight: '0.1rem',
        }}
      >
        {assignedOptions.length > 0 && filteredAssigned.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                opacity: 0.6,
                fontWeight: 600,
              }}
            >
              Assigned Sites
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {filteredAssigned.map((option) => {
                const isActive = selectedTenantID === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelection(option)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--theme-success-500)' : 'var(--theme-elevation-150)',
                      background: isActive ? 'var(--theme-success-100)' : 'var(--theme-elevation-50)',
                      color: 'var(--theme-text)',
                      fontSize: '0.9rem',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{option.label}</span>
                    {isActive && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Active</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {assignedOptions.length > 0 && filteredAssigned.length > 0 && filteredOthers.length > 0 && (
          <div
            style={{
              borderTop: '1px solid var(--theme-elevation-150)',
              margin: '0.25rem 0',
            }}
          />
        )}

        {filteredOthers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {assignedOptions.length > 0 && (
              <span
                style={{
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  opacity: 0.6,
                  fontWeight: 600,
                }}
              >
                All Sites
              </span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {filteredOthers.map((option) => {
                const isActive = selectedTenantID === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelection(option)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--theme-success-500)' : 'var(--theme-elevation-150)',
                      background: isActive ? 'var(--theme-success-100)' : 'var(--theme-elevation-50)',
                      color: 'var(--theme-text)',
                      fontSize: '0.9rem',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{option.label}</span>
                    {isActive && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Active</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {filteredAssigned.length === 0 && filteredOthers.length === 0 && (
          <div
            style={{
              fontSize: '0.85rem',
              opacity: 0.65,
              padding: '0.6rem 0',
              textAlign: 'center',
            }}
          >
            No sites match “{searchTerm}”.
          </div>
        )}
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
          tenantLabel: label ?? undefined,
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

export default CustomTenantSelector
