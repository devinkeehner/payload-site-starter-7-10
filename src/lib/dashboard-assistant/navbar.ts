import { DashboardInputError } from './access'
import { z } from 'zod-v4'
import type { Navbar } from '@/payload-types'

const id = z.string().trim().min(1).max(160)
const label = z.string().trim().min(1).max(180)
const url = z.string().trim().min(1).max(2048).refine(value => {
  if (/[\\\s]/u.test(value)) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false }
}, 'Use a site path starting with / or an HTTP(S) URL.')
export const navbarChanges = z.array(z.union([
  z.object({ action: z.literal('add'), parentId: id.nullable(), beforeId: id.nullable(), label, url, newTab: z.boolean() }).strict(),
  z.object({ action: z.literal('edit'), id, label: label.nullable(), url: url.nullable(), newTab: z.boolean().nullable() }).strict(),
  z.object({ action: z.literal('remove'), id }).strict(),
  z.object({ action: z.literal('move'), id, parentId: id.nullable(), beforeId: id.nullable() }).strict(),
])).min(1).max(40)

type TopItem = NonNullable<Navbar['navItems']>[number]
type Item = Pick<TopItem, 'link' | 'newTab' | 'id'> & { subNav?: Item[] | null, subSubNav?: Item[] | null }
const childKey = (depth: number) => depth === 0 ? 'subNav' : 'subSubNav'

function find(rows: Item[], id: string, depth = 0): { rows: Item[]; index: number; depth: number } | undefined {
  for (const [index, item] of rows.entries()) {
    if (item.id === id) return { rows, index, depth }
    const children = item[childKey(depth)]
    if (children && depth < 2) {
      const match = find(children, id, depth + 1)
      if (match) return match
    }
  }
}

function relevel(item: Item, oldDepth: number, depth: number): Item {
  const { subNav, subSubNav, ...base } = item
  const children = oldDepth === 0 ? subNav : subSubNav
  if (!children?.length) return base
  if (depth >= 2) throw new DashboardInputError('Menus support three levels. This move would put children below the third level.')
  return { ...base, [childKey(depth)]: children.map(child => relevel(child, oldDepth + 1, depth + 1)) }
}

export function editNavbar(items: Navbar['navItems'], changes: z.infer<typeof navbarChanges>) {
  const root: Item[] = structuredClone(items ?? [])
  for (const change of changes) {
    let item: Item
    let previousDepth = 0
    if (change.action === 'add') {
      item = { link: { type: 'custom', label: change.label, url: change.url, newTab: change.newTab }, newTab: change.newTab }
    } else {
      const target = find(root, change.id)
      if (!target) throw new DashboardInputError('The requested menu item was not found. Read the current navbar again.')
      item = target.rows[target.index]!
      if (change.action === 'edit') {
        const link = { ...item.link }
        if (change.label !== null) link.label = change.label
        if (change.url !== null) Object.assign(link, { type: 'custom', reference: null, url: change.url })
        if (change.newTab !== null) item.newTab = link.newTab = change.newTab
        item.link = link
        continue
      }
      target.rows.splice(target.index, 1)
      if (change.action === 'remove') continue
      previousDepth = target.depth
    }
    let siblings = root
    let depth = 0
    if (change.parentId) {
      const parent = find(root, change.parentId)
      if (!parent || parent.depth >= 2) throw new DashboardInputError('Choose a parent in either of the first two menu levels outside the item being moved.')
      depth = parent.depth + 1
      siblings = parent.rows[parent.index]![childKey(parent.depth)] ??= []
    }
    const index = change.beforeId ? siblings.findIndex(row => row.id === change.beforeId) : siblings.length
    if (index < 0) throw new DashboardInputError('The requested insertion point is outside this menu level.')
    siblings.splice(index, 0, relevel(item, previousDepth, depth))
  }
  return root
}
