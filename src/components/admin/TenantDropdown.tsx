'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ConfirmationModal, SelectInput, useModal, useTranslation } from '@payloadcms/ui'
import type { ReactSelectOption } from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

const confirmSwitchTenantSlug = 'custom-tenant-selector-confirm-switch'
const confirmLeaveWithoutSavingSlug = 'custom-tenant-selector-confirm-leave'

const toOption = (candidate: unknown): ReactSelectOption | undefined => {
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
  const { openModal, closeModal } = useModal()
  const { i18n, t } = useTranslation()

  const normalizedOptions = useMemo<ReactSelectOption[]>(() => {
    if (!Array.isArray(options)) return []
    return options
      .map((option) => toOption(option))
      .filter((option): option is ReactSelectOption => Boolean(option))
  }, [options])

  const selectedValue = selectedTenantID == null ? undefined : String(selectedTenantID)
  const currentOption = useMemo(
    () => normalizedOptions.find((option) => option.value === selectedValue),
    [normalizedOptions, selectedValue],
  )

  const [pendingSelection, setPendingSelection] = useState<ReactSelectOption | undefined>(undefined)

  const translateLabel = useCallback(() => {
    return t('plugin-multi-tenant:nav-tenantSelector-label', {
      lng: i18n?.language,
    })
  }, [i18n?.language, t])

  const switchTenant = useCallback(
    (option: ReactSelectOption | undefined) => {
      setPendingSelection(undefined)
      if (option?.value) {
        setTenant({ id: option.value as string, refresh: true })
      } else {
        setTenant({ id: undefined, refresh: true })
      }
    },
    [setTenant],
  )

  const handleChange = useCallback(
    (option: unknown) => {
      const parsed = toOption(option)
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

  if (normalizedOptions.length <= 1) return null

  return (
    <div
      className="tenant-selector tenant-selector--custom"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}
    >
      <SelectInput
        isClearable={false}
        label={translateLabel()}
        name="customTenantSelector"
        onChange={handleChange}
        options={normalizedOptions}
        path="customTenantSelector"
        readOnly={false}
        value={selectedValue}
        className="tenant-selector--custom__input"
      />

      <ConfirmationModal
        body={t('plugin-multi-tenant:confirm-tenant-switch--body', {
          fromTenant: currentOption?.label,
          toTenant: pendingSelection?.label,
        })}
        cancelLabel={t('general:stayOnThisPage')}
        confirmLabel={t('general:leaveAnyway')}
        heading={t('plugin-multi-tenant:confirm-tenant-switch--heading', {
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
        body={t('general:changesNotSaved')}
        cancelLabel={t('general:stayOnThisPage')}
        confirmLabel={t('general:leaveAnyway')}
        heading={t('general:leaveWithoutSaving')}
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
