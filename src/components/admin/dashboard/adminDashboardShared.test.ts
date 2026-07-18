import { describe, expect, it } from 'vitest'

import {
  DASHBOARD_PRIMARY_TASK_ORDER,
  WEBSITE_SHORTCUT_TASK_ORDER,
  orderAdminTasks,
  type AdminTask,
  type AdminTaskKey,
} from './adminDashboardShared'

const task = (key: AdminTaskKey): AdminTask => ({
  description: `${key} description`,
  href: `/admin/${key}`,
  key,
  label: key,
})

describe('dashboard task ordering', () => {
  it('keeps the approved dashboard quick-action order', () => {
    const result = orderAdminTasks(
      [task('uploadMedia'), task('createForm'), task('viewPosts'), task('createPost')],
      DASHBOARD_PRIMARY_TASK_ORDER,
    )

    expect(result.map(({ key }) => key)).toEqual([
      'createPost',
      'viewPosts',
      'createForm',
      'uploadMedia',
    ])
  })

  it('preserves role-filtered subsets without inserting unavailable tasks', () => {
    const result = orderAdminTasks(
      [task('uploadMedia'), task('createPost')],
      DASHBOARD_PRIMARY_TASK_ORDER,
    )

    expect(result.map(({ key }) => key)).toEqual(['createPost', 'uploadMedia'])
  })

  it('keeps the approved website shortcut order', () => {
    const result = orderAdminTasks(
      [
        task('editTowns'),
        task('updateSocialMedia'),
        task('changeHomePageBanner'),
        task('editNavbar'),
      ],
      WEBSITE_SHORTCUT_TASK_ORDER,
    )

    expect(result.map(({ key }) => key)).toEqual([
      'editNavbar',
      'changeHomePageBanner',
      'updateSocialMedia',
      'editTowns',
    ])
  })
})
