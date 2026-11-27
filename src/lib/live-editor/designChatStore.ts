import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { PayloadRequest } from 'payload'
import { NativeDraftError } from './emailDraft'
import {
  DESIGN_CHAT_RUN_MS, type DesignChatRequest, type DesignChatThread, type DesignToolCall,
  type DesignToolResult, type StoredDesignChatMessage,
} from './designChatProtocol'
import { captureCanvasTool } from './designChatTools'

type Thread = {
  _id: string
  id: string
  messages: StoredDesignChatMessage[]
  active?: { id: string; expiresAt: Date }
}

type ToolExchange = { _id: string; scope: string; name: string; expiresAt: Date; result?: DesignToolResult }
type Mongo = ReturnType<PayloadRequest['payload']['db']['connection']['getClient']>
const toolIndexes = new WeakMap<Mongo, Promise<string>>()
const retainedMessages = 200

export function designChatScope(userId: string, tenantId: string | null, pageId: string) {
  return createHash('sha256').update(JSON.stringify([userId, tenantId, pageId])).digest('hex')
}

export function designChatStore(req: PayloadRequest, scope: string) {
  const { connection } = req.payload.db
  const mongo = connection.getClient()
  const db = mongo.db(connection.name)
  const threads = db.collection<Thread>('liveEditorDesignChats')
  const exchanges = db.collection<ToolExchange>('liveEditorDesignChatExchanges')
  const view = (doc: Thread): DesignChatThread => ({
    id: doc.id, messages: doc.messages, busy: Boolean(doc.active && doc.active.expiresAt > new Date()),
  })

  return {
    async load() {
      const current = await threads.findOneAndUpdate({ _id: scope }, {
        $setOnInsert: { id: randomUUID(), messages: [] },
      }, { upsert: true, returnDocument: 'after' })
      if (!current) throw new Error('Unable to read the design chat.')
      return view(current)
    },

    async reset(chatId: string) {
      const current = await threads.findOneAndUpdate({
        _id: scope, id: chatId,
        $or: [{ active: { $exists: false } }, { 'active.expiresAt': { $lte: new Date() } }],
      }, { $set: { id: randomUUID(), messages: [] }, $unset: { active: '' } }, { returnDocument: 'after' })
      if (!current) throw new NativeDraftError('This chat is busy or changed in another tab. Reload the conversation and try again.', 409)
      return view(current)
    },

    async begin(input: DesignChatRequest) {
      const runId = randomUUID()
      const message: StoredDesignChatMessage = {
        id: runId, role: 'user', content: input.message.content,
        attachments: input.message.attachments.map(file => file.kind === 'media' ? file : { kind: file.kind, name: file.name }),
      }
      const before = await threads.findOneAndUpdate({
        _id: scope, id: input.chatId,
        $or: [{ active: { $exists: false } }, { 'active.expiresAt': { $lte: new Date() } }],
      }, {
        $set: { active: { id: runId, expiresAt: new Date(Date.now() + DESIGN_CHAT_RUN_MS + 30_000) } },
        $push: { messages: { $each: [message], $slice: -retainedMessages } },
      }, { returnDocument: 'before' })
      if (!before) throw new NativeDraftError('This chat is busy or changed in another tab. Reload the conversation and try again.', 409)
      return {
        history: before.messages,
        finish: async (content: string) => {
          const current = await threads.findOneAndUpdate({ _id: scope, id: input.chatId, 'active.id': runId }, {
            $unset: { active: '' },
            ...(content ? { $push: { messages: { $each: [{ id: randomUUID(), role: 'assistant' as const, content }], $slice: -retainedMessages } } } : {}),
          }, { returnDocument: 'after' })
          if (!current) throw new Error('The design chat changed before the turn finished.')
          return view(current)
        },
      }
    },

    async runTool(name: string, args: unknown, send: (call: DesignToolCall) => void, signal: AbortSignal) {
      let index = toolIndexes.get(mongo)
      if (!index) {
        index = exchanges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => {
          toolIndexes.delete(mongo)
          throw error
        })
        toolIndexes.set(mongo, index)
      }
      await index
      signal.throwIfAborted()
      const id = randomUUID()
      const expiresAt = new Date(Date.now() + 45_000)
      await exchanges.insertOne({ _id: id, scope, name, expiresAt })
      try {
        signal.throwIfAborted()
        send({ id, name, arguments: args })
        while (new Date() < expiresAt) {
          await delay(240, undefined, { signal })
          const pending = await exchanges.findOne({ _id: id, scope, result: { $exists: true } }, { projection: { result: 1 } })
          if (pending?.result) return pending.result
        }
        throw new Error('The editor did not respond in time.')
      } finally {
        await exchanges.deleteOne({ _id: id, scope })
      }
    },

    async finishTool(result: DesignToolResult) {
      const update = await exchanges.updateOne({
        _id: result.id, scope, expiresAt: { $gt: new Date() }, result: { $exists: false },
        ...(result.screenshot ? { name: captureCanvasTool.name } : {}),
      }, { $set: { result } })
      if (!update.modifiedCount) throw new NativeDraftError('This editor action is no longer waiting for a result.', 409)
    },
  }
}

export type DesignChatStore = ReturnType<typeof designChatStore>
