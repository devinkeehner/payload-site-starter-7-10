import { ADMIN_WORKSPACE_ENTRIES } from '@/components/admin/adminWorkspace'

const collectionWidgetOptionSlugs = ADMIN_WORKSPACE_ENTRIES.map((entry) => entry.slug)

export const collectionWidgetOptions = collectionWidgetOptionSlugs.map((slug) => {
  const entry = ADMIN_WORKSPACE_ENTRIES.find((item) => item.slug === slug)

  return {
    label: entry?.label || slug,
    value: slug,
  }
})
