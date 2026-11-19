import { LiveEmailEditorClient } from '@/components/admin/email-live-editor/LiveEmailEditorClient'
export default async function LiveEmailEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ block?: string; field?: string; from?: string }>
}) {
  const [{ id }, { block, field, from }] = await Promise.all([params, searchParams])
  return <LiveEmailEditorClient key={id} emailId={id} focusBlock={block} focusField={field} returnToReview={from === 'review'} />
}
