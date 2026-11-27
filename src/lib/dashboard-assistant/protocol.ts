import type { DesignChatThread } from '@/lib/live-editor/designChatProtocol'

export const MAX_ASSISTANT_MESSAGE = 32_000
export const assistantEndpoint = '/api/admin/assistant'

export type DashboardChatEvent =
  | { type: 'activity'; name: string }
  | { type: 'text'; delta: string }
  | { type: 'done'; thread: DesignChatThread }
  | { type: 'error'; message: string }
