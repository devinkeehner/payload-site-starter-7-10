export type AdminWorkspaceSectionKey = 'publishing' | 'engagement' | 'website' | 'advanced'

export type AdminWorkspaceSection = {
  defaultOpen: boolean
  description: string
  key: AdminWorkspaceSectionKey
  label: string
  slugs: readonly string[]
}

export type AdminWorkspaceEntry = {
  dashboard?: boolean
  description: string
  label: string
  section: AdminWorkspaceSectionKey
  slug: string
}

/**
 * The editor-facing information architecture for the HRO admin.
 *
 * Payload collection groups still describe the data model. This registry describes
 * how people find that data. New collections should be added here once, then the
 * sidebar and dashboard will keep the same labels, grouping, and disclosure rules.
 */
export const ADMIN_WORKSPACE_ENTRIES = [
  {
    dashboard: true,
    description: 'Write, review, and publish news and updates.',
    label: 'Posts',
    section: 'publishing',
    slug: 'posts',
  },
  {
    dashboard: true,
    description: 'Manage the pages that make up the website.',
    label: 'Pages',
    section: 'publishing',
    slug: 'pages',
  },
  {
    dashboard: true,
    description: 'Upload images, video, documents, and reusable files.',
    label: 'Media',
    section: 'publishing',
    slug: 'media',
  },
  {
    dashboard: true,
    description: 'Create and reuse social and website graphics.',
    label: 'Graphics',
    section: 'publishing',
    slug: 'graphic-designs',
  },
  {
    dashboard: true,
    description: 'Create forms for signups, contact requests, and responses.',
    label: 'Forms',
    section: 'engagement',
    slug: 'forms',
  },
  {
    description: 'Review messages and responses submitted through forms.',
    label: 'Form Responses',
    section: 'engagement',
    slug: 'form-submissions',
  },
  {
    dashboard: true,
    description: 'Draft, test, review, and send email updates.',
    label: 'Emails',
    section: 'engagement',
    slug: 'emails',
  },
  {
    dashboard: true,
    description: 'Build the audiences used for email sends.',
    label: 'Email Lists',
    section: 'engagement',
    slug: 'email-lists',
  },
  {
    dashboard: true,
    description: 'Find and manage the people in this site workspace.',
    label: 'Contacts',
    section: 'engagement',
    slug: 'contacts',
  },
  {
    dashboard: true,
    description: 'Update representative details, towns, and social links.',
    label: 'Site Profile',
    section: 'website',
    slug: 'rep-info',
  },
  {
    dashboard: true,
    description: 'Edit the website navigation and link labels.',
    label: 'Navigation',
    section: 'website',
    slug: 'navbars',
  },
  {
    dashboard: true,
    description: 'Manage the homepage banner and default social images.',
    label: 'Homepage Media',
    section: 'website',
    slug: 'standard-media',
  },
  {
    dashboard: true,
    description: 'Set website-wide search and social sharing defaults.',
    label: 'Site Search & Social',
    section: 'website',
    slug: 'site-seo',
  },
  {
    description: 'Edit the site-wide header content and appearance.',
    label: 'Header',
    section: 'website',
    slug: 'header',
  },
  {
    description: 'Edit the site-wide footer content and links.',
    label: 'Footer',
    section: 'website',
    slug: 'footer',
  },
  {
    description: 'Manage post categories.',
    label: 'Categories',
    section: 'advanced',
    slug: 'categories',
  },
  {
    description: 'Manage post article types.',
    label: 'Article Types',
    section: 'advanced',
    slug: 'article-types',
  },
  {
    description: 'Manage post author records.',
    label: 'Authors',
    section: 'advanced',
    slug: 'authors',
  },
  {
    description: 'Manage post tags.',
    label: 'Tags',
    section: 'advanced',
    slug: 'tags',
  },
  {
    description: 'Manage reusable graphic starting points.',
    label: 'Graphic Templates',
    section: 'advanced',
    slug: 'graphic-templates',
  },
  {
    description: 'Review imported legacy WordPress content.',
    label: 'WordPress Archive',
    section: 'advanced',
    slug: 'wordpress-posts',
  },
  {
    description: 'Manage admin users and access.',
    label: 'Users',
    section: 'advanced',
    slug: 'users',
  },
  {
    description: 'Manage sites and tenant access.',
    label: 'Sites',
    section: 'advanced',
    slug: 'tenants',
  },
] as const satisfies readonly AdminWorkspaceEntry[]

export const ADMIN_WORKSPACE_SECTIONS = [
  {
    defaultOpen: true,
    description: 'Create and publish website content.',
    key: 'publishing',
    label: 'Publishing',
    slugs: ADMIN_WORKSPACE_ENTRIES.filter((entry) => entry.section === 'publishing').map((entry) => entry.slug),
  },
  {
    defaultOpen: true,
    description: 'Forms, email, lists, and contacts.',
    key: 'engagement',
    label: 'Engagement',
    slugs: ADMIN_WORKSPACE_ENTRIES.filter((entry) => entry.section === 'engagement').map((entry) => entry.slug),
  },
  {
    defaultOpen: true,
    description: 'Website-wide content and settings.',
    key: 'website',
    label: 'Website',
    slugs: ADMIN_WORKSPACE_ENTRIES.filter((entry) => entry.section === 'website').map((entry) => entry.slug),
  },
  {
    defaultOpen: false,
    description: 'Supporting records and technical tools.',
    key: 'advanced',
    label: 'Advanced',
    slugs: ADMIN_WORKSPACE_ENTRIES.filter((entry) => entry.section === 'advanced').map((entry) => entry.slug),
  },
] as const satisfies readonly AdminWorkspaceSection[]

const entryBySlug = new Map<string, AdminWorkspaceEntry>(
  ADMIN_WORKSPACE_ENTRIES.map((entry) => [entry.slug, entry]),
)

export const getAdminWorkspaceEntry = (slug: string) => entryBySlug.get(slug)

export const getAdminWorkspaceLabel = (slug: string, fallback: string) =>
  getAdminWorkspaceEntry(slug)?.label || fallback

export const getAdminWorkspaceDescription = (slug: string, fallback: string) =>
  getAdminWorkspaceEntry(slug)?.description || fallback

export const getDashboardWorkspaceSlugs = () =>
  ADMIN_WORKSPACE_ENTRIES.filter(
    (entry) => 'dashboard' in entry && entry.dashboard === true,
  ).map((entry) => entry.slug)
