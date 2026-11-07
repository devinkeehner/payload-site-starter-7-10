import { LiveEmailEditorClient } from '@/components/admin/email-live-editor/LiveEmailEditorClient'
export default async function LiveEmailEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LiveEmailEditorClient key={id} emailId={id} />
}
