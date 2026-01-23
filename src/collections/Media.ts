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
          const file: any = (req as any)?.file
          const tenantId = (data as any)?.tenant
          if (file && typeof file === 'object' && tenantId && req?.payload) {
            const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantId })
            const slug = (tenant as any)?.slug
            if (slug) {
              // Place the upload under /<tenant-slug>/
              file.prefix = `${slug}/`
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

        const buildKey = (file: any): string | undefined => {
          if (!file || typeof file !== 'object') return undefined
          const prefix = file?.prefix as string | undefined
          const filename = file?.filename as string | undefined
          if (prefix && filename) return `${prefix.replace(/\/+$/, '')}/${filename.replace(/^\/+/, '')}`
          if (filename) return filename
          const keyFromUrl = getKeyFromUrl(String(file?.url || ''))
          return keyFromUrl
        }

        const setAbsUrl = (file: any) => {
          if (!file) return
          const key = buildKey(file)
          if (base && key) {
            file.url = `${base.replace(/\/+$/, '')}/${key}`
          }
        }

        // Top-level file
        setAbsUrl(doc)

        // Generated sizes
        if (doc?.sizes && typeof doc.sizes === 'object') {
          Object.values(doc.sizes).forEach((size: any) => setAbsUrl(size))
        }

        return doc
      },
    ],
  },
  upload: {
    staticDir: path.resolve(dirname, '../../public/media'),
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    filenameCompoundIndex: ['tenant', 'filename'],
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
