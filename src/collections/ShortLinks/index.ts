import type { Access, CollectionConfig } from 'payload'
import { isSuperUser } from '@/lib/access/isSuperUser'
import { siteIDs } from '@/lib/tinyurl/policy'
import { syncShortLink } from '@/lib/tinyurl/service'

const siteAccess: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperUser(req.user)) return true
  const ids = siteIDs(req.user)
  return ids.length ? { tenant: { in: ids } } : false
}
const internalField = { create: () => false, update: () => false }
export const ShortLinks: CollectionConfig = {
  slug: 'short-links',
  labels: { singular: 'Short Link', plural: 'Short Links' },
  admin: {
    group: 'Site Settings',
    useAsTitle: 'alias',
    defaultColumns: ['alias', 'shortURL', 'destinationURL', 'archived', 'syncError'],
    description:
      'Create or edit redirects for this site. Import all existing links from the TinyURL section in Site Profile. Archived links are shown for reference; restore them in TinyURL before editing.',
  },
  access: {
    read: siteAccess,
    create: ({ req }) => Boolean(req.user && (isSuperUser(req.user) || siteIDs(req.user).length)),
    update: siteAccess,
    delete: () => false,
  },
  hooks: { beforeChange: [syncShortLink] },
  fields: [
    {
      name: 'alias',
      type: 'text',
      required: true,
      admin: {
        description:
          '1–30 letters, numbers, underscores or hyphens; tinyurl.com requires at least 5. Save alias and destination changes separately.',
      },
    },
    {
      name: 'destinationURL',
      label: 'Destination URL',
      type: 'text',
      required: true,
      admin: {
        description:
          'A public HTTP(S) URL. Links attached to published content follow that content automatically.',
      },
    },
    { name: 'domain', type: 'text', admin: { readOnly: true }, access: internalField },
    {
      name: 'shortURL',
      label: 'Short URL',
      type: 'text',
      admin: { readOnly: true },
      access: internalField,
    },
    {
      name: 'remoteKey',
      type: 'text',
      unique: true,
      admin: { hidden: true },
      access: internalField,
    },
    {
      name: 'source',
      label: 'Linked content',
      type: 'relationship',
      relationTo: ['posts', 'pages'],
      admin: { readOnly: true },
      access: internalField,
    },
    {
      name: 'archived',
      type: 'checkbox',
      defaultValue: false,
      admin: { readOnly: true },
      access: internalField,
    },
    {
      name: 'syncError',
      label: 'Sync needs attention',
      type: 'text',
      admin: {
        readOnly: true,
        description:
          'If publication changes a URL and TinyURL cannot be updated, this field explains why. Retry from the content’s sidebar after resolving the error.',
      },
      access: internalField,
    },
  ],
}
