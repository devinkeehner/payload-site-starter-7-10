import type { PuckBlockSchema } from '@/lib/puck/types'

export type LiveEditorKind = 'email' | 'post' | 'form' | 'page'

export const liveEditorVariants = {
  email: {
    label: 'Email',
    collection: 'emails',
    storageLabel: 'Compose',
    saveLabel: 'Save draft',
    settingsTitle: 'Inbox details',
    settings: [['title', 'Email title'], ['subject', 'Subject'], ['preheader', 'Preview text'], ['replyTo', 'Reply-to email']],
    saveKeys: ['layout', 'title', 'subject', 'preheader', 'replyTo'],
  },
  post: {
    label: 'Post',
    collection: 'posts',
    storageLabel: 'Layout',
    saveLabel: 'Save draft',
    settingsTitle: 'Post details',
    settings: [['title', 'Post title']],
    saveKeys: ['layout', 'title'],
  },
  page: {
    label: 'Page',
    collection: 'pages',
    storageLabel: 'Layout',
    saveLabel: 'Save draft',
    settingsTitle: 'Page details',
    settings: [['title', 'Page title']],
    saveKeys: ['layout', 'title'],
  },
  form: {
    label: 'Form',
    collection: 'forms',
    storageLabel: 'Form builder',
    saveLabel: 'Save form',
    settingsTitle: 'Form settings',
    settings: [],
    saveKeys: ['layout', 'title', 'submitButtonLabel', 'confirmationType', 'confirmationMessage', 'redirect', 'enableHoneypot', 'enableTurnstile'],
  },
} as const

const formSettingsFields: PuckBlockSchema['fields'] = [
  { name: 'title', label: 'Form name', type: 'text', required: true },
  { name: 'submitButtonLabel', label: 'Submit button label', type: 'text' },
  { name: 'confirmationType', label: 'After submission', type: 'select', required: true, defaultValue: 'message', options: [
    { label: 'Show a confirmation message', value: 'message' },
    { label: 'Redirect to another URL', value: 'redirect' },
  ] },
]

const formProtectionFields: PuckBlockSchema['fields'] = [
  { name: 'enableHoneypot', label: 'Honeypot', type: 'checkbox', defaultValue: true },
  { name: 'enableTurnstile', label: 'Turnstile CAPTCHA', type: 'checkbox', defaultValue: false },
]

export function getFormSettingsSchema(redirect: boolean): PuckBlockSchema {
  return {
    slug: 'formSettings',
    label: 'Form settings',
    fields: [
      ...formSettingsFields,
      redirect
        ? { name: 'redirect', type: 'group', label: 'Redirect', fields: [{ name: 'url', label: 'Redirect URL', type: 'text', required: true }] }
        : { name: 'confirmationMessage', label: 'Confirmation message', type: 'richText' },
      { name: 'protection', label: 'Spam protection', type: 'collapsible', fields: formProtectionFields },
    ],
  }
}
