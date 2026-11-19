import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { getSelectedTenantID } from '@/components/admin/dashboard/adminDashboardMeta'
import { CreateSettingsRecordButton, SiteSettingsLayout } from './SiteSettingsLayout'
import { availableSiteSettings, loadSiteSettingsIdentity } from './siteSettingsData'
import { siteSettingsDocumentURL } from './sections'
import styles from './site-settings.module.scss'

export default async function SiteSettingsView(props: AdminViewServerProps) {
  const { req, permissions, visibleEntities } = props.initPageResult
  if (!req.user) return null

  const adminRoute = req.payload.config.routes.admin
  const sections = availableSiteSettings(req, permissions)
  const section = sections.find((item) => item.key === props.searchParams?.section) ?? sections[0]
  const tenantQuery = props.searchParams?.tenant
  const tenantID =
    typeof tenantQuery === 'string' && tenantQuery ? tenantQuery : getSelectedTenantID(req)
  const site = tenantID ? await loadSiteSettingsIdentity(req, tenantID) : null
  let records: { id: string; label: string }[] = []

  if (site && section) {
    if (section.owner === 'tenants')
      redirect(siteSettingsDocumentURL(adminRoute, site.id, section, site.id))
    const result = await req.payload.find({
      collection: section.owner,
      req,
      overrideAccess: false,
      depth: 0,
      limit: 50,
      sort: '-updatedAt',
      where: { tenant: { equals: site.id } },
    })
    records = result.docs.map((doc) => ({
      id: String(doc.id),
      label: ('name' in doc ? doc.name : 'title' in doc ? doc.title : null) || String(doc.id),
    }))
    if (result.totalDocs === 1 && records[0]) {
      redirect(siteSettingsDocumentURL(adminRoute, site.id, section, records[0].id))
    }
  }

  return (
    <DefaultTemplate
      i18n={props.i18n}
      locale={props.locale}
      params={props.params}
      payload={props.payload}
      permissions={permissions}
      req={req}
      searchParams={props.searchParams}
      user={req.user}
      viewActions={props.viewActions}
      viewType={props.viewType}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        {section ? (
          <SiteSettingsLayout
            adminRoute={adminRoute}
            site={site}
            section={section}
            sections={sections}
          >
            <div className={styles.empty}>
              {!site ? (
                <>
                  <h3>{tenantID ? 'Site unavailable' : 'Select a site to edit'}</h3>
                  <p>Use the site selector in the admin header or open Settings from My Sites.</p>
                  <a href={`${adminRoute}#my-sites`}>Open My Sites</a>
                </>
              ) : records.length ? (
                <>
                  <h3>Choose a settings record</h3>
                  <p>
                    This site has more than one record for this section. Choose the record you want
                    to edit.
                  </p>
                  <ul>
                    {records.map((record) => (
                      <li key={record.id}>
                        <a href={siteSettingsDocumentURL(adminRoute, site.id, section, record.id)}>
                          {record.label}
                        </a>
                        <small>{record.id}</small>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <h3>No settings record for {site.name}</h3>
                  {permissions.collections?.[section.owner]?.create && (
                    <CreateSettingsRecordButton
                      href={`${formatAdminURL({ adminRoute, path: `/collections/${section.owner}/create` })}?tenant=${encodeURIComponent(site.id)}`}
                      tenant={site.id}
                    />
                  )}
                </>
              )}
            </div>
          </SiteSettingsLayout>
        ) : (
          <p>Site settings are unavailable for this account.</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
