'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ConfirmationModal, useAuth, useModal, useTranslation } from '@payloadcms/ui'
import ReactSelect, {
  type GroupBase,
  type OptionsOrGroups,
  type SingleValue,
  type StylesConfig,
} from 'react-select'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import { useActiveTenant } from './hooks/useActiveTenant'

const confirmSwitchTenantSlug = 'custom-tenant-selector-confirm-switch'
const confirmLeaveWithoutSavingSlug = 'custom-tenant-selector-confirm-leave'

export type TenantOption = {
  label: string
  value: string
}

type Props = {
  optionsOverride?: TenantOption[]
  selectedTenantIDOverride?: string
}

type TenantAssignment = {
  tenant?: string | { id?: unknown; value?: unknown }
}

const toOption = (candidate: unknown): TenantOption | undefined => {
  if (!candidate || typeof candidate !== 'object') return undefined
  const option = candidate as { label?: unknown; value?: unknown }
  if (option.value == null) return undefined
  return {
    label: option.label == null ? '' : String(option.label),
    value: String(option.value),
  }
}

const toTenantID = (candidate: unknown): string | undefined => {
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    const value = String(candidate).trim()
    return value || undefined
  }
  if (!candidate || typeof candidate !== 'object') return undefined

  const relation = candidate as { id?: unknown; value?: unknown }
  return toTenantID(relation.id ?? relation.value)
}

const setTenantCookieFallback = (tenantID?: string) => {
  const value = tenantID ? encodeURIComponent(tenantID) : ''
  const maxAge = tenantID ? 60 * 60 * 24 * 365 : -1
  document.cookie = `payload-tenant=${value}; path=/; max-age=${maxAge}; samesite=lax`
  window.location.reload()
}

const TenantDropdown: React.FC<Props> = ({ optionsOverride = [], selectedTenantIDOverride }) => {
  const { entityType, modified, options = [], selectedTenantID, setTenant } = useTenantSelection()
  const { tenantID: activeTenantID } = useActiveTenant()
  const { user } = useAuth()
  const { openModal, closeModal } = useModal()
  const { t } = useTranslation()

  const openAssignedSites = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    window.location.hash = 'my-sites'
    window.requestAnimationFrame(() => {
      document.getElementById('my-sites')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const formatTenantGroupLabel = useCallback(
    (group: GroupBase<TenantOption>) => {
      const isAssignedSites = group.label === 'Assigned Sites'

      return (
        <span className="tenant-selector--custom__group-heading">
          <span>{group.label}</span>
          {isAssignedSites ? (
            <a
              aria-label="Edit assigned sites"
              href="/admin#my-sites"
              onClick={openAssignedSites}
              onPointerDownCapture={openAssignedSites}
            >
              Edit assigned
            </a>
          ) : null}
        </span>
      )
    },
    [openAssignedSites],
  )

  const assignedTenantIDs = useMemo(() => {
    const ids = new Set<string>()
    const assignments = Array.isArray(user?.tenants) ? (user.tenants as TenantAssignment[]) : []
    assignments.forEach((assignment) => {
      const relation = assignment?.tenant
      if (!relation) return
      if (typeof relation === 'string') {
        ids.add(relation)
        return
      }
      if (typeof relation === 'object') {
        const relationID =
          (relation as { id?: unknown; value?: unknown }).id ??
          (relation as { value?: unknown }).value
        if (relationID != null) ids.add(String(relationID))
      }
    })
    return ids
  }, [user])

  const { normalizedOptions, groupedOptions } = useMemo<{
    normalizedOptions: TenantOption[]
    groupedOptions: OptionsOrGroups<TenantOption, GroupBase<TenantOption>>
  }>(() => {
    const sourceOptions =
      Array.isArray(optionsOverride) && optionsOverride.length > 1
        ? optionsOverride
        : Array.isArray(options)
          ? options
          : []

    if (!Array.isArray(sourceOptions)) {
      return { normalizedOptions: [], groupedOptions: [] }
    }

    const entries = sourceOptions
      .map((option) => toOption(option))
      .filter((option): option is TenantOption => Boolean(option))
      .map((option) => ({
        label: option.label,
        value: option.value,
      }))

    const sorted = [...entries].sort((a, b) => String(a.label).localeCompare(String(b.label)))

    if (!assignedTenantIDs.size) {
      return { normalizedOptions: sorted, groupedOptions: sorted }
    }

    const grouped: OptionsOrGroups<TenantOption, GroupBase<TenantOption>> = [
      {
        label: 'Assigned Sites',
        options: sorted.filter((option) => assignedTenantIDs.has(option.value)),
      },
      {
        label: 'All Sites',
        options: sorted.filter((option) => !assignedTenantIDs.has(option.value)),
      },
    ]

    return {
      normalizedOptions: sorted,
      groupedOptions: grouped,
    }
  }, [assignedTenantIDs, options, optionsOverride])

  const pluginSelectedValue = toTenantID(selectedTenantID) || ''
  const selectedValue = pluginSelectedValue || selectedTenantIDOverride || activeTenantID
  const currentOption = useMemo(
    () => normalizedOptions.find((option) => option.value === selectedValue),
    [normalizedOptions, selectedValue],
  )

  const [pendingSelection, setPendingSelection] = useState<TenantOption | undefined>(undefined)

  const translate = useMemo(
    () => t as unknown as (key: string, options?: Record<string, unknown>) => string,
    [t],
  )

  const [isHydrated, setIsHydrated] = useState(false)

  const translateLabel = useCallback(() => {
    return 'Site Navigation'
  }, [])

  const switchTenant = useCallback(
    (option: TenantOption | undefined) => {
      setPendingSelection(undefined)
      const pluginOptionIDs = Array.isArray(options)
        ? options.map((candidate) => toOption(candidate)?.value).filter(Boolean)
        : []

      if (pluginOptionIDs.length === 0) {
        setTenantCookieFallback(option?.value)
        return
      }

      if (option?.value) {
        setTenant({ id: option.value, refresh: true })
      } else {
        setTenant({ id: undefined, refresh: true })
      }
    },
    [options, setTenant],
  )

  const attemptTenantChange = useCallback(
    (parsed: TenantOption | undefined) => {
      if (!parsed) {
        switchTenant(undefined)
        return
      }

      if (parsed.value === selectedValue) return

      if (entityType === 'document') {
        setPendingSelection(parsed)
        openModal(confirmSwitchTenantSlug)
        return
      }

      if (entityType === 'global' && modified) {
        setPendingSelection(parsed)
        openModal(confirmLeaveWithoutSavingSlug)
        return
      }

      switchTenant(parsed)
    },
    [entityType, modified, openModal, selectedValue, switchTenant],
  )

  const handleChange = useCallback(
    (option: SingleValue<TenantOption>) => {
      attemptTenantChange(option ?? undefined)
    },
    [attemptTenantChange],
  )

  const reactSelectStyles = useMemo<StylesConfig<TenantOption, false>>(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: 42,
        borderRadius: '0.75rem',
        borderColor: state.isFocused ? 'var(--theme-elevation-400)' : 'var(--theme-elevation-200)',
        boxShadow: state.isFocused
          ? '0 0 0 3px var(--theme-elevation-100)'
          : '0 1px 2px rgba(15, 23, 42, 0.06)',
        backgroundColor: 'var(--theme-elevation-0)',
        '&:hover': {
          borderColor: 'var(--theme-elevation-400)',
        },
      }),
      valueContainer: (base) => ({
        ...base,
        padding: '0.25rem 2.5rem 0.25rem 0.85rem',
      }),
      singleValue: (base) => ({
        ...base,
        fontWeight: 600,
        color: 'var(--theme-text)',
      }),
      placeholder: (base) => ({
        ...base,
        color: 'var(--theme-text)',
        opacity: 0.7,
      }),
      input: (base) => ({
        ...base,
        color: 'var(--theme-text)',
      }),
      option: (base, state) => ({
        ...base,
        borderRadius: '0.5rem',
        fontWeight: state.isSelected || state.isFocused ? 650 : 500,
        margin: '0.08rem 0.4rem',
        padding: '0.58rem 0.7rem',
        width: 'calc(100% - 0.8rem)',
        backgroundColor: state.isSelected
          ? 'var(--theme-elevation-200)'
          : state.isFocused
            ? 'var(--theme-elevation-100)'
            : 'transparent',
        color: 'var(--theme-text)',
      }),
      menu: (base) => ({
        ...base,
        backgroundColor: 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-200)',
        borderRadius: '0.85rem',
        boxShadow: '0 18px 46px rgba(15, 23, 42, 0.2)',
        minWidth: '22rem',
        overflow: 'hidden',
        zIndex: 60,
      }),
      menuList: (base) => ({
        ...base,
        backgroundColor: 'var(--theme-elevation-0)',
        padding: '0.35rem 0 0.5rem',
      }),
      menuPortal: (base) => ({
        ...base,
        zIndex: 70,
      }),
      groupHeading: (base) => ({
        ...base,
        borderTop: '1px solid var(--theme-elevation-150)',
        color: 'var(--theme-elevation-600)',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.055em',
        margin: '0.45rem 0 0.25rem',
        padding: '0.65rem 0.75rem 0.25rem',
        textTransform: 'uppercase',
        width: '100%',
      }),
    }),
    [],
  )

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) return null
  if (normalizedOptions.length <= 1) return null

  return (
    <div className="tenant-selector tenant-selector--custom">
      <label className="tenant-selector--custom__label" htmlFor="tenant-selector__input">
        {translateLabel()}
      </label>
      <ReactSelect
        className="tenant-selector--custom__select"
        classNamePrefix="rs"
        formatGroupLabel={formatTenantGroupLabel}
        inputId="tenant-selector__input"
        isClearable={false}
        options={groupedOptions}
        onChange={handleChange}
        value={currentOption ?? null}
        styles={reactSelectStyles}
        menuPlacement="auto"
        menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
        placeholder="Select a site"
        theme={(theme) => ({
          ...theme,
          borderRadius: 10,
          colors: {
            ...theme.colors,
            primary: 'var(--theme-elevation-250)',
          },
        })}
      />

      <ConfirmationModal
        body={translate('plugin-multi-tenant:confirm-tenant-switch--body', {
          fromTenant: currentOption?.label,
          toTenant: pendingSelection?.label,
        })}
        cancelLabel={translate('general:stayOnThisPage')}
        confirmLabel={translate('general:leaveAnyway')}
        heading={translate('plugin-multi-tenant:confirm-tenant-switch--heading', {
          tenantLabel: 'Tenant',
        })}
        modalSlug={confirmSwitchTenantSlug}
        onCancel={() => {
          setPendingSelection(undefined)
          closeModal(confirmSwitchTenantSlug)
        }}
        onConfirm={() => {
          switchTenant(pendingSelection)
          closeModal(confirmSwitchTenantSlug)
        }}
      />

      <ConfirmationModal
        body={translate('general:changesNotSaved')}
        cancelLabel={translate('general:stayOnThisPage')}
        confirmLabel={translate('general:leaveAnyway')}
        heading={translate('general:leaveWithoutSaving')}
        modalSlug={confirmLeaveWithoutSavingSlug}
        onCancel={() => {
          setPendingSelection(undefined)
          closeModal(confirmLeaveWithoutSavingSlug)
        }}
        onConfirm={() => {
          switchTenant(pendingSelection)
          closeModal(confirmLeaveWithoutSavingSlug)
        }}
      />
    </div>
  )
}

export default TenantDropdown
