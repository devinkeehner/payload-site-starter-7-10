export type FormSettings = {
  confirmationMessage: string
  confirmationType: 'message' | 'redirect'
  enableHoneypot: boolean
  enableTurnstile: boolean
  redirectURL: string
  submitButtonLabel: string
  title: string
}

type LexicalNode = {
  children?: LexicalNode[]
  text?: string
}

export function getLexicalPlainText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''

  const root = (value as { root?: LexicalNode }).root
  if (!root) return ''

  const readNode = (node: LexicalNode): string => {
    if (typeof node.text === 'string') return node.text
    if (!Array.isArray(node.children)) return ''
    return node.children.map(readNode).filter(Boolean).join(node === root ? '\n' : '')
  }

  return readNode(root).trim()
}

export function createLexicalText(value: string) {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: value.trim(),
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

export function normalizeFormSettings(settings: FormSettings): FormSettings {
  return {
    ...settings,
    confirmationMessage: settings.confirmationMessage.trim(),
    redirectURL: settings.redirectURL.trim(),
    submitButtonLabel: settings.submitButtonLabel.trim() || 'Submit',
    title: settings.title.trim(),
  }
}

