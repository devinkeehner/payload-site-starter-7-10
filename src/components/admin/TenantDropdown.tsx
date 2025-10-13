'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ConfirmationModal, useAuth, useModal, useTranslation } from '@payloadcms/ui'
import ReactSelect, { type GroupBase, type OptionsOrGroups, type SingleValue, type StylesConfig } from 'react-select'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

const confirmSwitchTenantSlug = 'custom-tenant-selector-confirm-switch'
const confirmLeaveWithoutSavingSlug = 'custom-tenant-selector-confirm-leave'

type TenantOption = {
  label: string
  value: string
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

const TenantDropdown: React.FC = () => {
  const { entityType, modified, options = [], selectedTenantID, setTenant } = useTenantSelection()
  const { user } = useAuth()
  const { openModal, closeModal } = useModal()
  const { i18n, t } = useTranslation()

  const assignedTenantIDs = useMemo(() => {
    const ids = new Set<string>()
    if (Array.isArray(user?.tenants)) {
      user.tenants.forEach((assignment: any) => {
        const relation = assignment?.tenant
        if (!relation) return
        if (typeof relation === 'string') {
          ids.add(relation)
          return
        }
        if (typeof relation === 'object') {
          const relationID = relation?.id ?? relation?.value
          if (relationID != null) ids.add(String(relationID))
        }
      })
    }
    return ids
  }, [user])

  const { normalizedOptions, groupedOptions } = useMemo<{
    normalizedOptions: TenantOption[]
    groupedOptions: OptionsOrGroups<TenantOption, GroupBase<TenantOption>>
  }>(() => {
    if (!Array.isArray(options)) return { normalizedOptions: [], selectOptions: [] }

    const entries = options
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

    const assigned: TenantOption[] = []

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
  }, [options, assignedTenantIDs])

  const selectedValue = selectedTenantID == null ? undefined : String(selectedTenantID)
  const currentOption = useMemo(
    () => normalizedOptions.find((option) => option.value === selectedValue),
    [normalizedOptions, selectedValue],
  )

  const [pendingSelection, setPendingSelection] = useState<TenantOption | undefined>(undefined)

  const translate = useMemo(
    () => t as unknown as (key: string, options?: Record<string, unknown>) => string,
    [t],
  )

  const translateLabel = useCallback(() => {
    return 'Site Navigation'
  }, [])

  const switchTenant = useCallback(
    (option: OptionObject | undefined) => {
      setPendingSelection(undefined)
      if (option?.value) {
        setTenant({ id: option.value as string, refresh: true })
      } else {
        setTenant({ id: undefined, refresh: true })
      }
    },
    [setTenant],
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
        minHeight: 44,
        borderRadius: '0.65rem',
        borderColor: state.isFocused ? 'var(--theme-elevation-250)' : 'var(--theme-elevation-150)',
        boxShadow: state.isFocused ? '0 0 0 2px var(--theme-elevation-150)' : base.boxShadow,
        '&:hover': {
          borderColor: 'var(--theme-elevation-250)',
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
      option: (base, state) => ({
        ...base,
        fontWeight: state.isSelected || state.isFocused ? 600 : 500,
        backgroundColor: state.isSelected
          ? 'var(--theme-elevation-150)'
          : state.isFocused
            ? 'var(--theme-elevation-100)'
            : base.backgroundColor,
        color: 'var(--theme-text)',
      }),
      menu: (base) => ({
        ...base,
        zIndex: 40,
      }),
      groupHeading: (base) => ({
        ...base,
        textTransform: 'uppercase',
        fontSize: '0.65rem',
        letterSpacing: '0.08em',
        fontWeight: 600,
        opacity: 0.65,
      }),
    }),
    [],
  )

  if (normalizedOptions.length <= 1) return null

  return (
    <div
      className="tenant-selector tenant-selector--custom"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}
    >
      <label className="tenant-selector--custom__label" htmlFor="tenant-selector__input">
        {translateLabel()}
      </label>
      <ReactSelect
        className="tenant-selector--custom__select"
        classNamePrefix="rs"
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
