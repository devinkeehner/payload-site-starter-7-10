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

function getWidthLabel(width: number) {
  if (width >= 99) return 'Full row'
  if (width >= 49 && width <= 51) return 'Half row'
  if (width >= 32 && width <= 34) return 'Third row'
  if (width >= 24 && width <= 26) return 'Quarter row'
  return `${width}% wide`
}

function MetaList({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className={styles.formFieldMeta}>
      {items.filter((item) => item.value).map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function FieldChrome({
  children,
  label,
  props,
}: {
  children: React.ReactNode
  label: string
  props: Record<string, unknown>
}) {
  const width = getNumber(props.width, 100)
  const clampedWidth = Math.max(1, Math.min(100, width))
  const meta = [
    { label: 'Name', value: getString(props.name, 'fieldName') },
    { label: 'Width', value: `${getWidthLabel(clampedWidth)} (${clampedWidth}%)` },
  ]

  return (
    <div className={styles.formFieldPreview} style={{ ['--field-width' as string]: `${clampedWidth}%` }}>
      <div className={styles.formFieldLabel}>
        <span>{label}</span>
        {props.required ? <em>Required</em> : null}
      </div>
      {children}
      <MetaList items={meta} />
    </div>
  )
}

function ChoicePreview({ props, type }: { props: Record<string, unknown>; type: string }) {
  const label = getString(props.label, type === 'image-select' ? 'Choose an image' : 'Choose one')
  const options = getOptions(props.options)

  if (type === 'select') {
    const placeholder = getString(props.placeholder, 'Choose an option')
    const defaultValue = getString(props.defaultValue)
    return (
      <FieldChrome label={label} props={props}>
        <div className={styles.formInputPreview}>{placeholder}</div>
        <MetaList
          items={[
            { label: 'Placeholder', value: placeholder },
            { label: 'Default', value: defaultValue || 'None' },
            { label: 'Options', value: options.map((option) => `${getString(option.label, 'Option')} = ${getString(option.value, 'value')}`).join(', ') },
          ]}
        />
      </FieldChrome>
    )
  }

  return (
    <FieldChrome label={label} props={props}>
      <div className={type === 'image-select' ? styles.formImageOptionsPreview : styles.formOptionsPreview}>
        {(options.length ? options : [{ label: 'First option' }, { label: 'Second option' }]).slice(0, 4).map((option, index) => {
          const media = type === 'image-select' ? normalizeMediaResource(option.image) : null
          return (
            <span key={index}>
              {media?.url ? (
                <span
                  aria-hidden="true"
                  className={styles.formImageOptionMedia}
                  style={{ backgroundImage: `url(${JSON.stringify(media.url)})` }}
                />
              ) : null}
              <i aria-hidden="true" />
              {getString(option.label, `Option ${index + 1}`)}
            </span>
          )
        })}
      </div>
      <MetaList
        items={[
          { label: 'Default', value: getString(props.defaultValue, 'None') },
          { label: 'Options', value: options.map((option) => `${getString(option.label, 'Option')} = ${getString(option.value, 'value')}`).join(', ') },
          { label: 'Selection', value: type === 'image-select' && props.allowMultiple ? 'Multiple allowed' : '' },
        ]}
      />
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
    return (
      <FieldChrome label={getString(props.label, 'Checkbox')} props={props}>
        <div className={styles.formCheckboxPreview}>
          <i aria-hidden="true" />
          <span>{getString(props.label, 'Checkbox')}</span>
        </div>
        <MetaList items={[{ label: 'Default', value: getBooleanLabel(props.defaultValue) }]} />
      </FieldChrome>
    )
  }

  if (blockType === 'video-capture') {
    return (
      <FieldChrome label={getString(props.label, 'Record a video')} props={props}>
        <div className={styles.formVideoPreview}>Video upload / recording field</div>
        <MetaList
          items={[
            { label: 'Help', value: getString(props.helpText, 'None') },
            { label: 'Duration', value: `${getNumber(props.maxDuration, 60)} seconds max` },
            { label: 'File Size', value: `${getNumber(props.maxFileSizeMB, 100)} MB max` },
          ]}
        />
      </FieldChrome>
    )
  }

  const label = getString(
    props.label,
    blockType === 'email'
      ? 'Email address'
      : blockType === 'textarea'
        ? 'Long answer'
        : blockType === 'number'
          ? 'Number'
          : blockType === 'state'
            ? 'State'
            : blockType === 'country'
              ? 'Country'
              : 'Text field',
  )

  return (
    <FieldChrome label={label} props={props}>
      <div className={blockType === 'textarea' ? styles.formTextareaPreview : styles.formInputPreview}>
        {getString(props.defaultValue, blockType === 'email' ? 'name@example.com' : blockType === 'state' ? 'State selector' : blockType === 'country' ? 'Country selector' : 'No default value')}
      </div>
      <MetaList
        items={[
          { label: 'Default', value: getString(props.defaultValue, 'None') },
          { label: 'Type', value: blockType },
        ]}
      />
    </FieldChrome>
  )
}
