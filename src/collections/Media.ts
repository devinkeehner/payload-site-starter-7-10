import type { CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import { anyone } from '@/lib/access/anyone'
import { authenticated } from '@/lib/access/authenticated'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

type TenantDoc = { slug?: string | null }
type FileLike = {
  prefix?: string
  filename?: string
  url?: string
}

const getObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

const asFileLike = (value: unknown): FileLike | null => {
  const record = getObject(value)
  if (!record) return null
  return {
    prefix: typeof record.prefix === 'string' ? record.prefix : undefined,
    filename: typeof record.filename === 'string' ? record.filename : undefined,
    url: typeof record.url === 'string' ? record.url : undefined,
  }
}

export const Media: CollectionConfig = {
  admin: {
    group: 'Content',
  },
  slug: 'media',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'caption',
      type: 'richText',
      required: false,
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        try {
          const reqRecord = getObject(req)
          const file = reqRecord?.file
          const dataRecord = getObject(data)
          const tenantId = typeof dataRecord?.tenant === 'string' ? dataRecord.tenant : undefined
          if (file && typeof file === 'object' && tenantId && req?.payload) {
            const tenant = (await req.payload.findByID({ collection: 'tenants', id: tenantId })) as TenantDoc
            const slug = tenant?.slug
            if (slug) {
              // Place the upload under /<tenant-slug>/
              ;(file as Record<string, unknown>).prefix = `${slug}/`
            }
          }
        } catch {
          // no-op: fallback to default prefix if anything fails
        }
        return data
      },
    ],
    afterRead: [
      ({ doc }) => {
        const base = process.env.R2_PUBLIC_BASE_URL || ''

        const getKeyFromUrl = (url: string): string | undefined => {
          if (!url) return undefined
          try {
            const u = new URL(url, 'http://_') // base to parse relative URLs
            return u.pathname.replace(/^\/+/, '') || undefined
          } catch {
            // url might be a simple path like "/media/file.png" or "media/file.png"
            return url.replace(/^\/+/, '') || undefined
          }
        }

        const buildKey = (file: unknown): string | undefined => {
          const parsedFile = asFileLike(file)
          if (!parsedFile) return undefined
          const prefix = parsedFile.prefix
          const filename = parsedFile.filename
          if (prefix && filename) return `${prefix.replace(/\/+$/, '')}/${filename.replace(/^\/+/, '')}`
          if (filename) return filename
          const keyFromUrl = getKeyFromUrl(String(parsedFile.url || ''))
          return keyFromUrl
        }

        const setAbsUrl = (file: unknown) => {
          const fileRecord = getObject(file)
          if (!fileRecord) return
          const key = buildKey(file)
          if (base && key) {
            fileRecord.url = `${base.replace(/\/+$/, '')}/${key}`
          }
        }

        // Top-level file
        setAbsUrl(doc)

        // Generated sizes
        if (doc?.sizes && typeof doc.sizes === 'object') {
          Object.values(doc.sizes).forEach((size) => setAbsUrl(size))
        }

        return doc
      },
    ],
  },
  upload: {
    staticDir: path.resolve(dirname, '../../public/media'),
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 300,
      },
      {
        name: 'square',
        width: 500,
        height: 500,
      },
      {
        name: 'small',
        width: 600,
      },
      {
        name: 'medium',
        width: 900,
      },
      {
        name: 'large',
        width: 1400,
      },
      {
        name: 'xlarge',
        width: 1920,
      },
      {
        name: 'og',
        width: 1200,
        height: 630,
        crop: 'center',
      },
    ],
  },
}
