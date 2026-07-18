export type AdminTaskKey =
  | 'createPost'
  | 'viewPosts'
  | 'createForm'
  | 'uploadMedia'
  | 'createPage'
  | 'changeHomePageBanner'
  | 'updateSocialMedia'
  | 'editTowns'
  | 'editNavbar'

export type AdminTask = {
  description: string
  disabled?: boolean
  href: string
  key: AdminTaskKey
  label: string
}

export const DASHBOARD_PRIMARY_TASK_ORDER = [
  'createPost',
  'viewPosts',
  'createForm',
  'uploadMedia',
] as const satisfies readonly AdminTaskKey[]

export const WEBSITE_SHORTCUT_TASK_ORDER = [
  'editNavbar',
  'changeHomePageBanner',
  'updateSocialMedia',
  'editTowns',
] as const satisfies readonly AdminTaskKey[]

export function orderAdminTasks(tasks: AdminTask[], order: readonly AdminTaskKey[]): AdminTask[] {
  const rank = new Map(order.map((key, index) => [key, index]))
  return [...tasks].sort(
    (left, right) =>
      (rank.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.key) ?? Number.MAX_SAFE_INTEGER),
  )
}

export const collectionHelperText: Record<string, string> = {
  pages: 'Build campaign pages and edit the homepage.',
  posts: 'Write updates, news, and announcements.',
  media: 'Upload images, files, and reusable visuals.',
  tenants:
    'Manage tenant-wide identity, domains, SEO defaults, theme settings, and Facebook setup.',
  forms: 'Create signup, contact, volunteer, and RSVP forms.',
  'form-submissions': 'Review messages and form responses.',
  header: 'Edit the site-wide navigation and header style.',
  footer: 'Edit the site-wide footer content.',
  alerts: 'Create or edit the Boom Bar shown above the header.',
  categories: 'Organize posts by topic.',
  emails: 'Build, test, and organize campaign emails.',
  users: 'Manage admin accounts and roles.',
  redirects: 'Manage old URLs that should point somewhere new.',
  search: 'Inspect generated search index records.',
  'facebook-connections': 'Manage connected Facebook page sources.',
  'facebook-pages': 'Review Facebook pages available from connected accounts.',
}

export const navGroupHelperText: Record<string, string> = {
  Collections: 'Content and settings available for your role.',
  Globals: 'Site-wide content that affects many pages.',
  Site: 'Tenant-wide header, footer, and Boom Bar settings.',
  Email: 'Email drafting and sending tools.',
}

export const quickTaskDescriptions: Record<AdminTaskKey, string> = {
  createPost: 'Draft a new news update or announcement.',
  viewPosts: 'Review, edit, and publish website posts.',
  createForm: 'Build a signup, contact, volunteer, or RSVP form.',
  uploadMedia: 'Add an image, video, document, or other reusable file.',
  createPage: 'Create a new website page and open its editor.',
  changeHomePageBanner: 'Update the homepage, mobile, and default featured images.',
  updateSocialMedia: 'Update representative social media links and Facebook connection settings.',
  editTowns: 'Update towns, town URLs, and district aid details.',
  editNavbar: 'Update tenant navigation links and labels.',
}
