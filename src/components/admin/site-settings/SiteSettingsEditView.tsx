import { DefaultEditView } from '@payloadcms/ui'
import type { DocumentViewClientProps, DocumentViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { SiteSettingsEditClient } from './SiteSettingsEditClient'
import { availableSiteSettings, loadSiteSettingsIdentity } from './siteSettingsData'
import { siteSettingsURL } from './sections'

export default async function SiteSettingsEditView(props: DocumentViewServerProps) {
  const {
    documentSubViewType,
    formState,
    viewType,
    BeforeDocumentControls,
    Description,
    EditMenuItems,
    LivePreview,
    PreviewButton,
    PublishButton,
    SaveButton,
    SaveDraftButton,
    Status,
    UnpublishButton,
    Upload,
    UploadControls,
  } = props
  const native: DocumentViewClientProps = {
    documentSubViewType,
    formState,
    viewType,
    BeforeDocumentControls,
    Description,
    EditMenuItems,
    LivePreview,
    PreviewButton,
    PublishButton,
    SaveButton,
    SaveDraftButton,
    Status,
    UnpublishButton,
    Upload,
    UploadControls,
  }
  const { req, permissions, collectionConfig } = props.initPageResult
  const sections = availableSiteSettings(req, permissions)
  const section = sections.find(
    (item) => item.key === props.searchParams?.hroSettings && item.owner === collectionConfig?.slug,
  )
  if (!section || !props.doc?.id) return <DefaultEditView {...native} />

  const relationship = props.doc?.tenant
  const tenantID =
    section.owner === 'tenants'
      ? props.doc?.id
      : typeof relationship === 'object' && relationship
        ? relationship.id
        : relationship
  if (!tenantID || String(tenantID) !== props.searchParams?.tenant)
    return <DefaultEditView {...native} />
  const site = await loadSiteSettingsIdentity(req, String(tenantID))
  if (!site) return <DefaultEditView {...native} />

  const adminRoute = req.payload.config.routes.admin
  const related =
    section.key === 'profile'
      ? {
          href: siteSettingsURL(adminRoute, site.id, 'images'),
          label: 'Edit district artwork in Website images',
        }
      : section.key === 'images' && sections.some((item) => item.key === 'search')
        ? {
            href: siteSettingsURL(adminRoute, site.id, 'search'),
            label: 'Edit the homepage sharing image',
          }
        : section.key === 'links' && permissions.collections?.['short-links']?.read
          ? {
              href: `${formatAdminURL({ adminRoute, path: '/collections/short-links' })}?${new URLSearchParams({ tenant: site.id, 'where[tenant][equals]': site.id })}`,
              label: 'View this site’s short links',
            }
          : section.key === 'administration'
            ? { href: `${adminRoute}#my-sites`, label: 'Manage assignments in My Sites' }
            : undefined

  return (
    <SiteSettingsEditClient
      layout={{ adminRoute, section, sections, site, recordID: String(props.doc.id) }}
      native={native}
      related={related}
    />
  )
}
