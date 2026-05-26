'use client'

import type { ListViewClientProps } from 'payload'

import { ProfileDefaultListView } from '@/components/admin/profile-list/ProfileDefaultListView'

export default function EmailListListView(props: ListViewClientProps) {
  return <ProfileDefaultListView {...props} profileCollectionSlug="email-lists" />
}
