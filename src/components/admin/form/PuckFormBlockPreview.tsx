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
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
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

  return (
    <div className={styles.formFieldPreview} style={{ ['--field-width' as string]: `${Math.max(1, Math.min(100, width))}%` }}>
      <label>
        <span>
          {label}
          {props.required ? <em>Required</em> : null}
        </span>
        {children}
      </label>
      <small>{getString(props.name, 'fieldName')}</small>
    </div>
  )
}

function ChoicePreview({ props, type }: { props: Record<string, unknown>; type: string }) {
  const label = getString(props.label, type === 'image-select' ? 'Choose an image' : 'Choose one')
  const options = getOptions(props.options)

  if (type === 'select') {
    return (
      <FieldChrome label={label} props={props}>
        <div className={styles.formInputPreview}>{getString(props.placeholder, 'Choose an option')}</div>
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
          <span>{getString(props.defaultValue, 'Yes')}</span>
        </div>
      </FieldChrome>
    )
  }

  if (blockType === 'video-capture') {
    return (
      <FieldChrome label={getString(props.label, 'Record a video')} props={props}>
        <div className={styles.formVideoPreview}>Video upload / recording field</div>
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
        {getString(props.defaultValue, blockType === 'email' ? 'name@example.com' : '')}
      </div>
    </FieldChrome>
  )
}
