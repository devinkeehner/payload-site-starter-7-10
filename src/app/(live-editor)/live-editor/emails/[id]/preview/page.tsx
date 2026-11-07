import { LiveEmailPreview } from '@/components/admin/email-live-editor/LiveEmailPreview'
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <LiveEmailPreview emailId={(await params).id} />
}
