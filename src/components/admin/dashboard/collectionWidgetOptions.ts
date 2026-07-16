const collectionWidgetOptionSlugs = [
  'pages',
  'posts',
  'wordpress-posts',
  'media',
  'forms',
  'form-submissions',
  'navbars',
  'authors',
  'tags',
  'site-seo',
  'rep-info',
  'standard-media',
  'graphic-templates',
  'graphic-designs',
  'emails',
  'email-lists',
  'contacts',
  'tenants',
  'users',
  'sitemap-artifacts',
  'chatgpt-oauth-clients',
] as const

export const collectionWidgetOptions = collectionWidgetOptionSlugs.map((slug) => ({
  label: slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' '),
  value: slug,
}))
