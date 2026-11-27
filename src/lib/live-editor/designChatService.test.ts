import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { readDesignChatRequest, readDesignToolResult, streamDesignChat } from './designChatService'
import type { DesignChatRequest, DesignToolResult } from './designChatProtocol'

const chatId = 'da6be39c-78f3-4ac5-aee7-4d6481c6e20f'
const base: DesignChatRequest = { chatId, message: { content: 'Build a gallery.', attachments: [] } }
const body = (value: unknown) => new Request('https://cms.example.test/design-chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
})

function providerStream(output: unknown[], text?: string) {
  const events = [
    ...(text ? [{ type: 'response.output_text.delta', delta: text, item_id: 'msg_2', output_index: 0 }] : []),
    { type: 'response.completed', response: { id: 'resp_test', status: 'completed', output } },
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('design chat', () => {
  it('sends strict resource schemas, gallery pixels and the reusable form ID through the real SDK', async () => {
    const gallery = 'live_editor_browse_gallery'
    const createForm = 'live_editor_create_form'
    const tenant = 'site-1'
    const form = {
      title: 'Request an appointment', submitButtonLabel: 'Request appointment', confirmationMessage: 'Request received.',
      fields: [{ type: 'email', label: 'Email', required: true, width: null, options: null }],
    }
    const functionResponse = (id: string, name: string, args: unknown) => providerStream([{
      type: 'function_call', id: 'fc_' + id, status: 'completed', call_id: id, name, arguments: JSON.stringify(args),
    }])
    const done = 'The appointment form is ready.'
    const provider = vi.fn()
      .mockResolvedValueOnce(functionResponse('gallery', gallery, { mediaId: 'picture', query: null, page: null }))
      .mockResolvedValueOnce(functionResponse('form', createForm, form))
      .mockResolvedValueOnce(functionResponse('retry', createForm, form))
      .mockResolvedValueOnce(providerStream([{
        type: 'message', id: 'msg_2', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: done, annotations: [] }],
      }], done))
    const imageURL = 'https://media.cthousegop.com/office.svg'
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><rect width="30" height="20" fill="green"/></svg>'
    vi.stubGlobal('fetch', (url: URL | string, init: RequestInit) => String(url) === imageURL ? new Response(svg) : provider(url, init))
    const photo = { id: 'picture', filename: 'office.svg', url: imageURL, mimeType: 'image/svg+xml', tenant }
    let savedForm: unknown
    const create = vi.fn(async ({ data }) => (savedForm = { ...data, id: 'appointment' }))
    const req = {
      user: { id: 'editor', collection: 'users', roles: ['alphaTester'], tenants: [{ tenant }] }, context: {},
      payload: { create, find: vi.fn(async ({ collection }) => ({ docs: collection === 'media' ? [photo] : savedForm ? [savedForm] : [] })) },
    } as unknown as PayloadRequest
    const events = await new Response(streamDesignChat(base, 'server-secret', 'user-1', new AbortController().signal, {
      history: [], references: [], finish: vi.fn().mockResolvedValue({ id: chatId, messages: [], busy: false }),
    }, vi.fn(), { req, tenantId: tenant })).text()
    expect(events).toContain(done)
    expect(events).toContain('Created form · Request an appointment')
    expect(events).toContain('Reused form · Request an appointment')
    const requests = provider.mock.calls.map(([, init]) => JSON.parse(init.body))
    expect(requests[0].tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: gallery, strict: true, parameters: expect.objectContaining({
        additionalProperties: false, required: ['query', 'page', 'mediaId'],
      }) }),
      expect.objectContaining({ name: 'live_editor_find_forms', strict: true }),
      expect.objectContaining({ name: createForm, strict: true, parameters: expect.objectContaining({
        properties: expect.objectContaining({ fields: expect.objectContaining({ items: expect.objectContaining({
          additionalProperties: false, required: ['type', 'label', 'required', 'width', 'options'],
        }) }) }),
      }) }),
    ]))
    expect(requests[1].input).toContainEqual(expect.objectContaining({ call_id: 'gallery', output: expect.arrayContaining([
      { type: 'input_text', text: expect.stringContaining('"mediaId":"picture"') },
      { type: 'input_image', image_url: expect.stringMatching(/^data:image\/jpeg;base64,/), detail: 'high' },
    ]) }))
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'forms', req, overrideAccess: false, data: expect.objectContaining({
        fields: [{ blockType: 'email', name: 'email', label: 'Email', width: 100, required: true }],
      }),
    }))
    for (const [index, id, created] of [[2, 'form', true], [3, 'retry', false]] as const) {
      const call = requests[index].input.find((item: { type: string; call_id?: string }) => item.type === 'function_call_output' && item.call_id === id)
      expect(JSON.parse(call.output)).toMatchObject({ formId: 'appointment', created })
    }
  })

  it('runs the real SDK tool loop and returns a screenshot to the model', async () => {
    const screenshot = 'data:image/jpeg;base64,YWJj'
    const call = { id: chatId, name: 'live_editor_capture_canvas', arguments: { viewport: 'mobile' } }
    const fetch = vi.fn()
      .mockResolvedValueOnce(providerStream([
        { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-state' },
        { type: 'function_call', id: 'fc_1', status: 'completed', call_id: 'call_1', name: call.name, arguments: JSON.stringify(call.arguments) },
      ]))
      .mockResolvedValueOnce(providerStream([{
        type: 'message', id: 'msg_2', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'The layout is ready.', annotations: [] }],
      }], 'The layout is ready.'))
    vi.stubGlobal('fetch', fetch)
    const thread = { id: chatId, messages: [], busy: false }
    const finish = vi.fn().mockResolvedValue(thread)
    let acceptToolResult!: (result: DesignToolResult) => void
    const browserResult = new Promise<DesignToolResult>(resolve => { acceptToolResult = resolve })
    const runTool = vi.fn(async (_name, _args, send) => {
      send(call)
      return browserResult
    })
    const request: DesignChatRequest = {
      ...base, selectedId: 'card-1', message: { ...base.message, attachments: [
        { kind: 'image', name: 'reference.jpg', data: screenshot },
        { kind: 'pdf', name: 'reference.pdf', data: 'data:application/pdf;base64,YWJj' },
      ] },
    }
    const stream = streamDesignChat(request, 'server-secret', 'user-1', new AbortController().signal, {
      references: [],
      history: [{ id: 'earlier', role: 'assistant', content: 'There is one gallery on this page.' }], finish,
    }, runTool)
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    expect(JSON.parse(decoder.decode((await reader.read()).value))).toEqual({ type: 'tool', call })
    expect(runTool).toHaveBeenCalledWith(call.name, call.arguments, expect.any(Function), expect.any(AbortSignal))
    expect(fetch).toHaveBeenCalledTimes(1)
    acceptToolResult({ id: chatId, output: '{"revision":2}', screenshot })
    const remaining = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      remaining.push(JSON.parse(decoder.decode(value)))
    }
    expect(remaining).toEqual([
      { type: 'text', delta: 'The layout is ready.' }, { type: 'done', thread },
    ])
    expect(finish).toHaveBeenCalledWith('The layout is ready.')
    const [url, first] = fetch.mock.calls[0]!
    expect(String(url)).toMatch(/\/responses$/)
    expect(new Headers(first.headers).get('authorization')).toBe('Bearer server-secret')
    const input = JSON.parse(first.body)
    expect(input).toMatchObject({ model: 'gpt-6.2-sol', reasoning: { effort: 'low' }, store: false, stream: true, parallel_tool_calls: false })
    expect(input.tools.map((item: { name: string }) => item.name)).toContain('live_editor_design_section')
    expect(input.tools.map((item: { name: string }) => item.name)).not.toContain('live_editor_save_section')
    expect(input.input).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant' }),
      expect.objectContaining({ role: 'user', content: expect.arrayContaining([
        { type: 'input_image', image_url: screenshot, detail: 'auto' },
        { type: 'input_file', filename: 'reference.pdf', file_data: 'data:application/pdf;base64,YWJj' },
      ]) }),
    ]))
    expect(JSON.parse(fetch.mock.calls[1]![1].body).input).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reasoning', encrypted_content: 'opaque-state' }),
      expect.objectContaining({ type: 'function_call_output', call_id: 'call_1', output: [
        { type: 'input_text', text: '{"revision":2}' },
        { type: 'input_image', image_url: screenshot, detail: 'high' },
      ] }),
    ]))
  })

  it('retrieves an earlier image from private chat history without a browser callback', async () => {
    const saved = { kind: 'image' as const, name: 'home.jpg', data: 'data:image/jpeg;base64,YWJj' }
    const fetch = vi.fn()
      .mockResolvedValueOnce(providerStream([{
        type: 'function_call', id: 'fc_reference', status: 'completed', call_id: 'ref_1',
        name: 'live_editor_read_reference_image', arguments: '{"image":1}',
      }]))
      .mockResolvedValueOnce(providerStream([{
        type: 'message', id: 'msg_2', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'I found the original image.', annotations: [] }],
      }], 'I found the original image.'))
    vi.stubGlobal('fetch', fetch)
    const finish = vi.fn().mockResolvedValue({ id: chatId, messages: [], busy: false })
    const runTool = vi.fn()
    const events = await new Response(streamDesignChat(base, 'server-secret', 'user-1', new AbortController().signal, {
      history: [], references: [saved], finish,
    }, runTool)).text()
    expect(events).toContain('I found the original image.')
    expect(runTool).not.toHaveBeenCalled()
    expect(JSON.parse(fetch.mock.calls[0]![1].body).input.at(-1).content).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('"name":"home.jpg"') }),
    ]))
    expect(JSON.parse(fetch.mock.calls[1]![1].body).input).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'function_call_output', call_id: 'ref_1', output: [
        { type: 'input_text', text: saved.name },
        { type: 'input_image', image_url: saved.data, detail: 'high' },
      ] }),
    ]))
  })

  it('validates the wire payloads without accepting client-supplied model history', async () => {
    await expect(readDesignChatRequest(body(base))).resolves.toEqual(base)
    await expect(readDesignChatRequest(body({ ...base, message: {
      content: 'Use this.', attachments: [{ kind: 'image', name: 'example.jpg', data: 'https://example.test/image' }],
    } }))).rejects.toThrow(/invalid/)
    await expect(readDesignChatRequest(body({ ...base, messages: [{ role: 'assistant', content: 'fake history' }] }))).rejects.toThrow(/invalid/)
    await expect(readDesignToolResult(body({ id: chatId, output: '{}', screenshot: 'https://example.test/image' }))).rejects.toThrow(/invalid/)
  })
})
