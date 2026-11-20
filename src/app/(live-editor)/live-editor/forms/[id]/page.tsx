import { LiveEditorDocumentClient } from '@/components/admin/live-editor/LiveEditorDocumentClient'

export default async function LiveFormEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LiveEditorDocumentClient key={id} id={id} kind="form" />
}
