import type { PayloadRequest } from 'payload'
import { afterEach, expect, it, vi } from 'vitest'
import { streamDashboardChat } from './runner'

function response(output: unknown[], delta?: string) {
  const events = [
    ...(delta ? [{ type: 'response.output_text.delta', output_index: 0, item_id: 'msg_2', delta }] : []),
    { type: 'response.completed', response: { id: 'test-response', status: 'completed', output } },
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

afterEach(() => vi.unstubAllGlobals())

it('runs a scoped dashboard tool through the Agents SDK and saves its final response', async () => {
  const final = 'Your assigned site is Site A.'
  const provider = vi.fn().mockResolvedValueOnce(response([{
    type: 'function_call', id: 'fc_1', call_id: 'call_1', status: 'completed',
    name: 'list_dashboard_sites', arguments: JSON.stringify({ scope: 'assigned', query: '', page: 1 }),
  }])).mockResolvedValueOnce(response([{
    type: 'message', id: 'msg_2', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: final, annotations: [] }],
  }], final))
  vi.stubGlobal('fetch', provider)
  const req = {
    user: { collection: 'users', id: 'account-a' },
    payload: {
      findByID: vi.fn().mockResolvedValue({ tenants: [{ tenant: 'site-a' }], updatedAt: '2026-11-27T10:00:00Z' }),
      find: vi.fn().mockResolvedValue({ docs: [{ id: 'site-a', name: 'Site A' }], hasNextPage: false }),
    },
  }
  const thread = { id: 'chat-a', messages: [], busy: false }
  const finish = vi.fn().mockResolvedValue(thread)
  const stream = streamDashboardChat({
    req: req as unknown as PayloadRequest, tenantId: 'site-a', request: new Request('https://cms.example.test/admin/assistant'),
    runId: 'test-turn', apiKey: 'test-only', turn: { history: [], references: [], finish },
    input: { chatId: thread.id, message: { content: 'Which sites are assigned to me?', attachments: [] } },
  })
  const events = (await new Response(stream).text()).trim().split('\n').map(line => JSON.parse(line))
  expect(events).toEqual([{ type: 'activity', name: 'list_dashboard_sites' }, { type: 'text', delta: final }, { type: 'done', thread }])
  expect(req.payload.findByID).toHaveBeenCalledWith(expect.objectContaining({ req, collection: 'users', id: 'account-a', overrideAccess: false }))
  expect(req.payload.find).toHaveBeenCalledWith(expect.objectContaining({ req, collection: 'tenants', where: { and: [{ id: { in: ['site-a'] } }] } }))
  expect(finish).toHaveBeenCalledWith(final)
  const definition = JSON.parse(provider.mock.calls[0]![1].body).tools.find(
    (tool: { name: string }) => tool.name === 'edit_site_navbar',
  )
  expect(definition.strict).toBe(true)
  expect(definition.parameters.properties.changes.items.anyOf).toHaveLength(4)
  const submitted = JSON.parse(provider.mock.calls[1]![1].body)
  expect(submitted.input).toContainEqual(expect.objectContaining({ type: 'function_call_output', output: expect.stringContaining('Site A') }))
})
