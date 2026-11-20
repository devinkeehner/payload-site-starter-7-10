import { LiveEditorDocumentClient } from '@/components/admin/live-editor/LiveEditorDocumentClient'
export default async function LiveEmailEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ block?: string; field?: string; from?: string }>
}) {
  const [{ id }, { block, field, from }] = await Promise.all([params, searchParams])
  return <LiveEditorDocumentClient key={id} id={id} kind="email" focusBlock={block} focusField={field} returnToReview={from === 'review'} />
}
