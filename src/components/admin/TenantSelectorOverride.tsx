'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ConfirmationModal, SelectInput, useModal, useTranslation } from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import type { ViewTypes } from 'payload'

type TenantSelectorOverrideProps = {
  disabled?: boolean
  label?: unknown
  viewType?: ViewTypes
}

type SelectOption = {
  label: string
  value: string
}

const confirmSwitchTenantSlug = 'tenant-selector-confirm-switch'
const confirmLeaveWithoutSavingSlug = 'tenant-selector-confirm-leave'

const toOption = (raw: unknown): SelectOption | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const option = raw as { label?: unknown; value?: unknown }
  if (option.value == null) return undefined
  return {
    label: option.label == null ? '' : String(option.label),
    value: String(option.value),
  }
}

const getOptionLabel = (option: unknown): string | undefined => {
  if (!option || typeof option !== 'object') return undefined
  const value = (option as { label?: unknown }).label
  return value == null ? undefined : String(value)
}

const translateLabel = (
  label: TenantSelectorOverrideProps['label'],
  translate: (key: string, options?: Record<string, unknown>) => string,
  locale: string | undefined,
): string => {
  if (!label) return translate('plugin-multi-tenant:nav-tenantSelector-label')
  if (typeof label === 'string') return translate(label as string)
  if (typeof label === 'object' && label !== null) {
    const record = label as Record<string, string>
    if (locale && record[locale]) return record[locale]
    if (record.en) return record.en
    const [first] = Object.values(record)
    if (first) return first
  }
  return String(label)
}

const TenantSelectorOverride: React.FC<TenantSelectorOverrideProps> = ({ disabled, label, viewType }) => {
  const { entityType, modified, options = [], selectedTenantID, setTenant } = useTenantSelection()
  const { openModal, closeModal } = useModal()
  const { i18n, t } = useTranslation()

  const normalizedOptions = useMemo<SelectOption[]>(() => {
    if (!Array.isArray(options)) return []
    return options
      .map((option) => toOption(option))
      .filter((option): option is SelectOption => Boolean(option))
  }, [options])

  const selectedValue = selectedTenantID == null ? undefined : String(selectedTenantID)
  const currentOption = useMemo(
    () => normalizedOptions.find((option) => option.value === selectedValue),
    [normalizedOptions, selectedValue],
  )

  const translate = useCallback(
    (key: string, variables?: Record<string, unknown>) => t(key as any, variables),
    [t],
  )

  const [pendingSelection, setPendingSelection] = useState<unknown>(undefined)

  const switchTenant = useCallback(
    (option: unknown) => {
      setPendingSelection(undefined)
      const parsed = toOption(option)
      if (parsed) {
        setTenant({ id: parsed.value, refresh: true })
      } else {
        setTenant({ id: undefined, refresh: true })
      }
    },
    [setTenant],
  )

  const handleChange = useCallback(
    (option: unknown) => {
      if (!option) {
        switchTenant(option)
        return
      }

      const parsed = toOption(option)
      if (!parsed) return

      if (parsed.value === selectedValue) return

      if (entityType === 'document') {
        setPendingSelection(option)
        openModal(confirmSwitchTenantSlug)
        return
      }

      if (entityType === 'global' && modified) {
        setPendingSelection(option)
        openModal(confirmLeaveWithoutSavingSlug)
        return
      }

      switchTenant(option)
    },
    [entityType, modified, openModal, selectedValue, switchTenant],
  )

  if (normalizedOptions.length <= 1) return null

  const pendingLabel = getOptionLabel(pendingSelection)
  const computedLabel = translateLabel(label, translate, i18n?.language)

  return (
    <div className="tenant-selector">
      <SelectInput
        isClearable={viewType === 'list'}
        label={computedLabel}
        name="setTenant"
        onChange={handleChange}
        options={normalizedOptions}
        path="setTenant"
        readOnly={Boolean(disabled)}
        value={selectedValue}
      />

      <ConfirmationModal
        body={translate('plugin-multi-tenant:confirm- tenant-switch--body', {
          fromTenant: currentOption?.label,
          toTenant: pendingLabel,
        })}
        cancelLabel={translate('general:stayOnThisPage')}
        confirmLabel={translate('general:leaveAnyway')}
        heading={translate('plugin-multi-tenant:confirm- tenant-switch--heading', {
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

export default TenantSelectorOverride
