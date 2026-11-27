import { createUnsteadyAgentTools, type UnsteadyAgentBinding } from './siteTools'

export const captureCanvasTool = {
  name: 'live_editor_capture_canvas',
  title: 'Look at the rendered canvas',
  description: 'Capture an image of the current unsaved page as rendered in its editor iframe. Optionally scroll to a block and switch between the desktop and phone canvas. Returns a visual preview and viewport geometry. Embedded players and some remote images may be omitted. Does not use the public website preview.',
  inputSchema: {
    type: 'object',
    properties: { blockId: { type: 'string', minLength: 1 }, viewport: { type: 'string', enum: ['current', 'desktop', 'mobile'] } },
    additionalProperties: false,
  },
}

export const captureSitePreviewTool = {
  name: 'live_editor_capture_site_preview',
  title: 'Check the actual site preview',
  description: 'Inspect the current unsaved draft in the real website template including its navigation, type, spacing, media and actual form fields. Choose desktop or mobile and a section by heading or a scroll position. This is the final check for visual edits.',
  inputSchema: {
    type: 'object',
    properties: {
      viewport: { type: 'string', enum: ['desktop', 'mobile'] },
      heading: { type: 'string', maxLength: 180, description: 'Visible heading text for the section to inspect.' },
      position: { type: 'string', enum: ['top', 'middle', 'bottom'] },
    },
    additionalProperties: false,
  },
}

export const readReferenceImageTool = {
  name: 'live_editor_read_reference_image',
  description: 'Look at an image attached in an earlier turn of this chat. Use its numbered image ID from the available references listed in the current request.',
}

export function createDesignChatTools(binding: UnsteadyAgentBinding) {
  return createUnsteadyAgentTools(binding).filter(tool => !tool.annotations.consequentialHint)
}

// Tool schemas come from the same definitions the browser executes. Only the
// current editor can supply its draft, media context, or canvas at execution time.
const unavailable = () => { throw new Error('Run this tool in the editor.') }
export const designChatToolDefinitions = [
  ...createDesignChatTools({
    getState: () => ({ document: { collection: 'pages' }, schemas: [], revision: 0 }),
    commit: unavailable,
    searchMedia: unavailable,
    undo: unavailable,
    redo: unavailable,
    preview: { read: unavailable, scroll: unavailable },
  }),
  captureCanvasTool, captureSitePreviewTool,
].map(({ name, description, inputSchema }) => ({ name, description, parameters: inputSchema }))
