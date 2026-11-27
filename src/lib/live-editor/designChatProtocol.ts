export const MAX_DESIGN_STEPS = 24
export const MAX_CHAT_MESSAGES = 18
export const MAX_CHAT_ATTACHMENTS = 4
export const MAX_SAVED_REFERENCE_IMAGES = 8
export const MAX_CHAT_MESSAGE = 8_000
export const MAX_CHAT_IMAGE = 500_000
export const MAX_CHAT_PDF = 2_850_000
export const MAX_CHAT_BODY = 8_000_000
export const DESIGN_CHAT_RUN_MS = 240_000

export type ChatAttachment =
  | { kind: 'image' | 'pdf' | 'text'; name: string; data: string }
  | { kind: 'media'; name: string; mediaId: string; mediaType: 'image' | 'video' | 'pdf' }

export type DesignReferenceImage = { kind: 'image'; name: string; data: string }

export type StoredChatAttachment = Exclude<ChatAttachment, { data: string }> |
  Pick<Extract<ChatAttachment, { data: string }>, 'kind' | 'name'>

export type StoredDesignChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: StoredChatAttachment[]
}

export type DesignChatThread = { id: string; messages: StoredDesignChatMessage[]; busy: boolean }
export type DesignChatRequest = {
  chatId: string
  message: { content: string; attachments: ChatAttachment[] }
  selectedId?: string
}

export type DesignToolCall = { id: string; name: string; arguments: unknown }
export type DesignToolResult = { id: string; output: string; screenshot?: string }
export type DesignChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; call: DesignToolCall }
  | { type: 'done'; thread: DesignChatThread }
  | { type: 'error'; message: string }
