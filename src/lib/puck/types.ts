import type { Data } from '@puckeditor/core'

export type PuckPageBlock = Record<string, unknown> & {
  blockType?: string
  id?: string | null
}

export type PuckPageDoc = Record<string, unknown> & {
  id?: string | number
  title?: string | null
  hero?: Record<string, unknown> | null
  layout?: PuckPageBlock[] | null
  _status?: 'draft' | 'published' | null
}

export type PuckEmailDoc = {
  id?: string | number
  title?: string | null
  layout?: unknown[] | null
  recipientEmail?: string | null
}

export type PuckFormDoc = Record<string, unknown> & {
  id?: string | number
  fields?: PuckPageBlock[] | null
  submitButtonLabel?: string | null
  title?: string | null
}

export type PuckPostDoc = Record<string, unknown> & {
  id?: string | number
  title?: string | null
  content?: Record<string, unknown> | null
  layout?: PuckPageBlock[] | null
  _status?: 'draft' | 'published' | null
}

export type PuckPageData = Data

export type PuckFieldSchema = {
  name: string
  label?: string | null
  type: string
  required?: boolean
  defaultValue?: unknown
  relationTo?: string | string[]
  minRows?: number
  maxRows?: number
  options?: Array<{ label: string; value: unknown }>
  fields?: PuckFieldSchema[]
  blocks?: PuckBlockSchema[]
}

export type PuckBlockSchema = {
  slug: string
  label: string
  group?: string | null
  fields: PuckFieldSchema[]
}
