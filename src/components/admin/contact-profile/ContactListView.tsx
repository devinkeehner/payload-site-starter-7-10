import type { ListViewClientProps } from 'payload'

import { ProfileDefaultListView } from '@/components/admin/profile-list/ProfileDefaultListView'

export default function ContactListView(props: ListViewClientProps) {
  return <ProfileDefaultListView {...props} profileCollectionSlug="contacts" />
}
