import { LiveEditorDocumentClient } from '@/components/admin/email-live-editor/LiveEmailEditorClient'

export default async function LivePostEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LiveEditorDocumentClient key={id} id={id} kind="post" />
}
