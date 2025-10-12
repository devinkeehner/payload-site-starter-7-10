'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ConfirmationModal, SelectInput, useAuth, useModal, useTranslation } from '@payloadcms/ui'
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

  const normalizedOptions = useMemo<TenantOption[]>(() => {
    if (!Array.isArray(options)) return []

    const normalized = options
      .map((option) => toOption(option))
      .filter((option): option is TenantOption => Boolean(option))

    return normalized.sort((a, b) => {
      const aAssigned = assignedTenantIDs.has(String(a.value))
      const bAssigned = assignedTenantIDs.has(String(b.value))
      if (aAssigned && !bAssigned) return -1
      if (!aAssigned && bAssigned) return 1
      return String(a.label).localeCompare(String(b.label))
    })
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
    return translate('plugin-multi-tenant:nav-tenantSelector-label')
  }, [translate])

  const switchTenant = useCallback(
    (option: TenantOption | undefined) => {
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
