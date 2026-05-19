const collectionWidgetOptionSlugs = [
  'pages',
  'posts',
  'bad-bills',
  'wordpress-posts',
  'media',
  'forms',
  'form-submissions',
  'navbars',
  'categories',
  'article-types',
  'authors',
  'tags',
  'site-seo',
  'rep-info',
  'standard-media',
  'graphic-templates',
  'graphic-designs',
  'icontact-folders',
  'icontact-lists',
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
