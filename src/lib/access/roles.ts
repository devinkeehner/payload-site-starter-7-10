import type { Access } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

type UserLike = unknown

export const CONTENT_EDITOR_COLLECTIONS = [
  'pages',
  'posts',
  'bad-bills',
  'wordpress-posts',
  'media',
  'forms',
  'form-submissions',
  'categories',
  'article-types',
  'authors',
  'tags',
  'site-seo',
  'rep-info',
  'standard-media',
  'navbars',
  'graphic-templates',
  'graphic-designs',
  'icontact-folders',
  'icontact-lists',
  'emails',
  'email-lists',
  'email-list-memberships',
  'email-send-events',
  'email-import-jobs',
  'contacts',
  'tenants',
  'users',
  'sitemap-artifacts',
  'chatgpt-oauth-clients',
  'chatgpt-oauth-codes',
  'chatgpt-oauth-tokens',
] as const

const SUPER_ONLY_COLLECTIONS = new Set([
  'api-keys',
  'payload-mcp-api-keys',
  'bad-bills',
  'categories',
  'article-types',
  'icontact-folders',
  'icontact-lists',
  'emails',
  'email-lists',
  'email-list-memberships',
  'email-send-events',
  'email-import-jobs',
  'contacts',
  'users',
  'tenants',
  'sitemap-artifacts',
  'chatgpt-oauth-clients',
  'chatgpt-oauth-codes',
  'chatgpt-oauth-tokens',
])

export function canAccessCollection(user: UserLike, collection: string): boolean {
  if (!user) return false
  if (SUPER_ONLY_COLLECTIONS.has(collection)) return isSuperUser(user)
  return true
}

export const superAdminAccess: Access = ({ req }) => isSuperUser(req.user)

export const roleRestrictedAccess =
  (collection: string): Access =>
  ({ req }) =>
    canAccessCollection(req.user, collection)

export const isCollectionHiddenForRole =
  (collection: string) =>
  ({ user }: { user?: UserLike }) =>
    !canAccessCollection(user ?? null, collection)
