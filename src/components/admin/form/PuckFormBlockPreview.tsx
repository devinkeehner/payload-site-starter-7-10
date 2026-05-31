'use client'

import React from 'react'

import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { normalizeMediaResource } from '@/lib/utilities/image'

type FormBlockPreviewProps = {
  blockType: string
  props: Record<string, unknown>
}

const choiceTypes = new Set(['checkbox-group', 'radio', 'select', 'image-select'])

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function getText(value: unknown, fallback = ''): React.ReactNode {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number') return value
  if (React.isValidElement(value)) return value
  return fallback
}

function getNumber(value: unknown, fallback: number) {
  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : fallback
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function getBooleanLabel(value: unknown) {
  return value === true || value === 'true' ? 'Checked by default' : 'Unchecked by default'
}

function isTruthy(value: unknown) {
  return value === true || value === 'true'
}

function getOptions(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : []
}

function getLexicalText(value: unknown) {
  const parts: string[] = []

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string') parts.push(record.text)
    if (Array.isArray(record.children)) record.children.forEach(walk)
    if (record.root) walk(record.root)
  }

  walk(value)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function getFallbackLabel(blockType: string) {
  switch (blockType) {
    case 'checkbox-group':
      return 'Select all that apply'
    case 'country':
      return 'Country'
    case 'email':
      return 'Email address'
    case 'image-select':
      return 'Choose an image'
    case 'number':
      return 'Number'
    case 'radio':
      return 'Choose one'
    case 'select':
      return 'Select one'
    case 'state':
      return 'State'
    case 'textarea':
      return 'Long answer'
    case 'video-capture':
      return 'Record a video'
    case 'checkbox':
      return 'Checkbox'
    default:
      return 'Text field'
  }
}

function getOptionLabelForValue(options: Record<string, unknown>[], value: unknown) {
  const stringValue = getString(value)
  if (!stringValue) return ''

  const match = options.find((option) => {
    const optionValue = getString(option.value)
    const optionLabel = getString(option.label)
    return optionValue === stringValue || optionLabel === stringValue
  })

  return getString(match?.label, stringValue)
}

function getOptionLabel(option: Record<string, unknown>, fallback: string) {
  return getText(option.label, fallback)
}

function getPreviewValue(value: unknown, fallback: string) {
  return getText(value, fallback)
}

function hasPreviewValue(value: unknown) {
  return (
    (typeof value === 'string' && value.trim().length > 0) ||
    typeof value === 'number' ||
    React.isValidElement(value)
  )
}

function PreviewNote({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return <div className={styles.formPreviewHint}>{children}</div>
}

function FieldChrome({
  children,
  label,
  props,
}: {
  children: React.ReactNode
  label: React.ReactNode
  props: Record<string, unknown>
}) {
  const width = getNumber(props.width, 100)
  const clampedWidth = Math.max(1, Math.min(100, width))

  return (
    <div className={styles.formFieldPreview} style={{ ['--field-width' as string]: `${clampedWidth}%` }}>
      <div className={styles.formFieldLabel}>
        <span>{label}</span>
        {props.required ? <em>Required</em> : null}
      </div>
      {children}
    </div>
  )
}

function ChoicePreview({ props, type }: { props: Record<string, unknown>; type: string }) {
  const label = getText(props.label, getFallbackLabel(type))
  const options = getOptions(props.options)
  const defaultValue = getString(props.defaultValue)

  if (type === 'select') {
    const placeholder = getString(props.placeholder, 'Choose an option')
    const selectedLabel = getOptionLabelForValue(options, defaultValue)
    const hasDefaultValue = hasPreviewValue(props.defaultValue)
    const previewValue = selectedLabel || (hasDefaultValue ? getPreviewValue(props.defaultValue, defaultValue) : placeholder)

    return (
      <FieldChrome label={label} props={props}>
        <div className={styles.formInputPreview} data-empty={!selectedLabel && !hasDefaultValue}>
          {previewValue}
        </div>
        {options.length ? (
          <PreviewNote>
            Options: {options.map((option, index) => (
              <React.Fragment key={index}>
                {index > 0 ? ', ' : ''}
                {getOptionLabel(option, 'Option')}
              </React.Fragment>
            ))}
          </PreviewNote>
        ) : null}
      </FieldChrome>
    )
  }

  return (
    <FieldChrome label={label} props={props}>
      <div className={type === 'image-select' ? styles.formImageOptionsPreview : styles.formOptionsPreview}>
        {(options.length ? options : [{ label: 'First option' }, { label: 'Second option' }]).slice(0, 4).map((option, index) => {
          const media = type === 'image-select' ? normalizeMediaResource(option.image) : null
          const optionLabel = getOptionLabel(option, `Option ${index + 1}`)
          const optionLabelString = getString(option.label, `Option ${index + 1}`)
          const optionValue = getString(option.value, optionLabelString)
          const selected = defaultValue && (defaultValue === optionValue || defaultValue === optionLabelString)
          return (
            <span key={index} data-selected={Boolean(selected)}>
              {media?.url ? (
                <span
                  aria-hidden="true"
                  className={styles.formImageOptionMedia}
                  style={{ backgroundImage: `url(${JSON.stringify(media.url)})` }}
                />
              ) : null}
              <i aria-hidden="true" />
              <b>{optionLabel}</b>
            </span>
          )
        })}
      </div>
      <PreviewNote>
        {defaultValue ? `Default: ${getOptionLabelForValue(options, defaultValue) || defaultValue}` : ''}
        {type === 'image-select' && props.allowMultiple ? `${defaultValue ? ' · ' : ''}Multiple selections allowed` : ''}
      </PreviewNote>
    </FieldChrome>
  )
}

export function PuckFormBlockPreview({ blockType, props }: FormBlockPreviewProps) {
  if (blockType === 'message') {
    return (
      <div className={styles.formMessagePreview}>
        {getLexicalText(props.message) || 'Helpful text or instructions'}
      </div>
    )
  }

  if (choiceTypes.has(blockType)) {
    return <ChoicePreview props={props} type={blockType} />
  }

  if (blockType === 'checkbox') {
    const label = getText(props.label, getFallbackLabel(blockType))
    return (
      <FieldChrome label={label} props={props}>
        <div className={styles.formCheckboxPreview}>
          <i aria-hidden="true" data-checked={isTruthy(props.defaultValue)} />
          <span>{label}</span>
        </div>
        <PreviewNote>{getBooleanLabel(props.defaultValue)}</PreviewNote>
      </FieldChrome>
    )
  }

  if (blockType === 'video-capture') {
    const helpText = getString(props.helpText)
    return (
      <FieldChrome label={getText(props.label, getFallbackLabel(blockType))} props={props}>
        <div className={styles.formVideoPreview}>{helpText || 'Video upload / recording field'}</div>
        <PreviewNote>
          {`${getNumber(props.maxDuration, 60)} seconds max, ${getNumber(props.maxFileSizeMB, 100)} MB max`}
        </PreviewNote>
      </FieldChrome>
    )
  }

  const label = getText(props.label, getFallbackLabel(blockType))
  const placeholder = getString(
    props.placeholder,
    blockType === 'email'
      ? 'name@example.com'
      : blockType === 'state'
        ? 'Select a state'
        : blockType === 'country'
          ? 'Select a country'
          : blockType === 'number'
            ? '0'
            : blockType === 'textarea'
              ? 'Enter a longer response'
              : 'Enter text',
  )
  const defaultValueText = typeof props.defaultValue === 'number'
    ? String(props.defaultValue)
    : getString(props.defaultValue)
  const hasDefaultValue = hasPreviewValue(props.defaultValue)
  const previewValue = hasDefaultValue
    ? getPreviewValue(props.defaultValue, defaultValueText)
    : placeholder

  return (
    <FieldChrome label={label} props={props}>
      <div
        className={blockType === 'textarea' ? styles.formTextareaPreview : styles.formInputPreview}
        data-empty={!hasDefaultValue}
      >
        {previewValue}
      </div>
      {defaultValueText ? <PreviewNote>Default: {defaultValueText}</PreviewNote> : null}
    </FieldChrome>
  )
}
