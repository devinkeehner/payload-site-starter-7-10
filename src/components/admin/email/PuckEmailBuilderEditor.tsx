'use client'

import React, { useMemo, useState } from 'react'

import {
  createVisualDocumentConfig,
  SavedRowPlaceholder,
  VisualDocumentEditor,
  type VisualDocumentEditorContext,
  type VisualPaletteItem,
  type VisualRowPreset,
} from '@/components/admin/puck/VisualDocumentEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import type { PuckBlockSchema, PuckEmailDoc, PuckPageData } from '@/lib/puck/types'

import { PuckEmailBlockPreview } from './PuckEmailBlockPreview'

const EMAIL_ROW_DROPZONE_MIN_HEIGHT = 176

type LinkCheck = {
  checkedAt?: string
  confirmed?: boolean
  confirmedAt?: string
  href: string
  label: string
  reason?: string
  remoteStatus?: number
  status: 'invalid' | 'merge' | 'ok' | 'warning'
}

type EmailReadiness = {
  quality?: {
    links: LinkCheck[]
  }
}

type EmailPayload = {
  data: PuckPageData
  email: PuckEmailDoc
}

export type PuckEmailBuilderProps = {
  blockSchema: PuckBlockSchema[]
  emailId: string
  initialData: PuckPageData
  initialRecipientEmail?: string | null
  title: string
}

const EMAIL_ROWS: VisualRowPreset[] = [
  { columns: [1], label: '1 Column', layout: 'oneColumn', mode: 'layoutRows', slug: 'emailRowOneColumn', zones: ['left'] },
  { columns: [1, 1], label: '2 Columns', layout: 'twoColumns', mode: 'layoutRows', slug: 'emailRowTwoColumns', zones: ['left', 'right'] },
  { columns: [2, 1], label: 'Left Wide', layout: 'twoColumnsLeftWide', mode: 'layoutRows', slug: 'emailRowLeftWide', zones: ['left', 'right'] },
  { columns: [1, 2], label: 'Right Wide', layout: 'twoColumnsRightWide', mode: 'layoutRows', slug: 'emailRowRightWide', zones: ['left', 'right'] },
  { columns: [1, 1, 1], label: '3 Columns', layout: 'threeColumns', mode: 'layoutRows', slug: 'emailRowThreeColumns', zones: ['left', 'center', 'right'] },
  { columns: [1, 1, 1, 1], label: '4 Columns', layout: 'fourColumns', mode: 'layoutRows', slug: 'emailRowFourColumns', zones: ['left', 'center', 'right', 'fourth'] },
]

const EMAIL_CONTENT_ORDER = [
  'emailHeading',
  'emailText',
  'emailImage',
  'emailVideo',
  'emailButton',
  'emailTwoButtons',
  'emailInlineLink',
  'emailDivider',
  'emailSpacer',
  'emailCallout',
  'emailList',
  'emailGallery',
  'emailArticleImageRight',
  'emailArticleTwoCards',
  'emailFeatureThreeCentered',
  'emailBentoGrid',
  'emailMarkdown',
  'emailHeaderSocial',
  'emailFooterOneColumn',
]

const EMAIL_CONTENT_ITEMS: VisualPaletteItem[] = [
  { icon: 'heading', kind: 'content', label: 'Heading', slug: 'emailHeading' },
  { icon: 'text', kind: 'content', label: 'Text', slug: 'emailText' },
  { icon: 'image', kind: 'content', label: 'Image', slug: 'emailImage' },
  { icon: 'video', kind: 'content', label: 'Video', slug: 'emailVideo' },
  { icon: 'button', kind: 'content', label: 'Button', slug: 'emailButton' },
  { icon: 'buttons', kind: 'content', label: '2 Buttons', slug: 'emailTwoButtons' },
  { icon: 'link', kind: 'content', label: 'Link', slug: 'emailInlineLink' },
  { icon: 'divider', kind: 'content', label: 'Divider', slug: 'emailDivider' },
  { icon: 'spacer', kind: 'content', label: 'Spacer', slug: 'emailSpacer' },
  { icon: 'callout', kind: 'content', label: 'Callout', slug: 'emailCallout' },
  { icon: 'list', kind: 'content', label: 'List', slug: 'emailList' },
  { icon: 'gallery', kind: 'content', label: 'Gallery', slug: 'emailGallery' },
  { icon: 'article', kind: 'content', label: 'Article', slug: 'emailArticleImageRight' },
  { icon: 'cards', kind: 'content', label: '2 Cards', slug: 'emailArticleTwoCards' },
  { icon: 'feature', kind: 'content', label: 'Feature', slug: 'emailFeatureThreeCentered' },
  { icon: 'bento', kind: 'content', label: 'Highlights', slug: 'emailBentoGrid' },
  { icon: 'code', kind: 'content', label: 'HTML', slug: 'emailMarkdown' },
  { icon: 'header', kind: 'content', label: 'Header', slug: 'emailHeaderSocial' },
  { icon: 'footer', kind: 'content', label: 'Footer', slug: 'emailFooterOneColumn' },
]

const EMAIL_PALETTE_ITEMS: VisualPaletteItem[] = [
  ...EMAIL_CONTENT_ITEMS,
  ...EMAIL_ROWS.map((row) => ({ kind: 'row' as const, label: row.label, slug: row.slug })),
]

function getContentPaletteSlugs(blockSchema: PuckBlockSchema[]): string[] {
  const availableSlugs = new Set(blockSchema.map((block) => block.slug))
  return EMAIL_CONTENT_ORDER.filter((slug) => availableSlugs.has(slug))
}

function getRowPaletteSlugs(blockSchema: PuckBlockSchema[]): string[] {
  return blockSchema.some((block) => block.slug === 'emailGrid')
    ? EMAIL_ROWS.map((row) => row.slug)
    : []
}

function getBlockingLinks(links: LinkCheck[] | undefined): LinkCheck[] {
  if (!Array.isArray(links)) return []
  return links.filter((link) => link.status === 'invalid')
}

function getReviewLinks(links: LinkCheck[] | undefined): LinkCheck[] {
  if (!Array.isArray(links)) return []
  return links.filter((link) => link.status === 'invalid' || link.status === 'warning')
}

export function PuckEmailBuilderEditor({
  blockSchema,
  emailId,
  initialData,
  initialRecipientEmail,
  title,
}: PuckEmailBuilderProps) {
  const contentPaletteSlugs = useMemo(() => getContentPaletteSlugs(blockSchema), [blockSchema])
  const rowPaletteSlugs = useMemo(() => getRowPaletteSlugs(blockSchema), [blockSchema])
  const config = useMemo(
    () => createVisualDocumentConfig({
      blockSchema,
      contentSlugs: contentPaletteSlugs,
      dropzoneMinHeight: EMAIL_ROW_DROPZONE_MIN_HEIGHT,
      layoutRowBlockSlug: 'emailGrid',
      nestedContentSlugs: blockSchema
        .map((block) => block.slug)
        .filter((slug) => !['emailGrid', 'emailHeaderSocial', 'emailFooterOneColumn'].includes(slug)),
      paletteItems: EMAIL_PALETTE_ITEMS,
      previewRenderer: ({ blockType, children, props }) => (
        <PuckEmailBlockPreview blockType={blockType} props={props}>
          {children}
        </PuckEmailBlockPreview>
      ),
      rootRenderer: (props) => (
        <main
          style={{
            background: '#f6f7f9',
            minHeight: '100%',
            padding: 0,
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid #d9dee7',
              borderRadius: 0,
              margin: '0 auto',
              maxWidth: 640,
              minHeight: 240,
              padding: 0,
            }}
          >
            {props.children}
          </div>
        </main>
      ),
      rows: EMAIL_ROWS,
    }),
    [blockSchema, contentPaletteSlugs],
  )
  const [linkCheck, setLinkCheck] = useState<EmailReadiness | null>(null)
  const [linkCheckMessage, setLinkCheckMessage] = useState<string | null>(null)
  const [emailStatus, setEmailStatus] = useState<'checkingLinks' | 'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [testEmailRecipient, setTestEmailRecipient] = useState(initialRecipientEmail || '')
  const [testEmailPanelOpen, setTestEmailPanelOpen] = useState(false)
  const [testEmailError, setTestEmailError] = useState<string | null>(null)

  function captureEmailPayload(payload: EmailPayload) {
    const recipientEmail = payload.email.recipientEmail || ''

    setTestEmailRecipient((current) => current || recipientEmail)
  }

  async function checkLinks(context: VisualDocumentEditorContext<EmailPayload>): Promise<boolean> {
    const saved = await context.saveLatestData()
    if (!saved) return false

    setEmailStatus('checkingLinks')
    setEmailMessage(null)
    setLinkCheckMessage(null)

    try {
      const res = await fetch(`/api/emails/${emailId}/readiness`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())

      const payload = (await res.json()) as EmailReadiness
      const links = payload.quality?.links || []
      const blockingLinks = getBlockingLinks(links)

      setLinkCheck(payload)
      setEmailStatus('idle')
      setLinkCheckMessage(
        blockingLinks.length
          ? `${blockingLinks.length} malformed or missing link${blockingLinks.length === 1 ? '' : 's'} found. Fix before sending.`
          : links.length
            ? `${links.length} link${links.length === 1 ? '' : 's'} checked. Warnings do not block test sends.`
            : 'No links found in this email.',
      )

      return blockingLinks.length === 0
    } catch (error) {
      setEmailStatus('error')
      setEmailMessage(error instanceof Error ? error.message : 'Unable to check links')
      return false
    }
  }

  async function sendTestEmail(context: VisualDocumentEditorContext<EmailPayload>, recipientEmail: string) {
    const trimmedRecipient = recipientEmail.trim()
    if (!trimmedRecipient) {
      setTestEmailError('Enter a test recipient email.')
      return
    }

    setTestEmailError(null)
    const linksPassed = await checkLinks(context)
    if (!linksPassed) return

    setEmailStatus('sending')
    setEmailMessage(null)

    try {
      const res = await fetch(`/api/emails/${emailId}/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: trimmedRecipient,
        }),
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { message?: string; recipientEmail?: string }
      setEmailStatus('sent')
      setEmailMessage(payload.message || `Test email sent to ${payload.recipientEmail || trimmedRecipient}.`)
      setTestEmailPanelOpen(false)
    } catch (error) {
      setEmailStatus('error')
      setEmailMessage(error instanceof Error ? error.message : 'Unable to send test email')
    }
  }

  async function confirmLink(context: VisualDocumentEditorContext<EmailPayload>, link: LinkCheck) {
    setEmailStatus('checkingLinks')
    setEmailMessage(null)

    try {
      const res = await fetch(`/api/emails/${emailId}/link-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          href: link.href,
          label: link.label,
          reason: link.reason || (link.remoteStatus ? `Remote check returned ${link.remoteStatus}` : undefined),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await checkLinks(context)
    } catch (error) {
      setEmailStatus('error')
      setEmailMessage(error instanceof Error ? error.message : 'Unable to confirm link')
    }
  }

  function continueToAudience(context: VisualDocumentEditorContext<EmailPayload>) {
    void context.saveLatestData().then((saved) => {
      if (saved) window.location.href = `/admin/collections/emails/${emailId}/audience`
    })
  }

  const links = linkCheck?.quality?.links || []
  const blockingLinks = getBlockingLinks(links)
  const reviewLinks = getReviewLinks(links)

  return (
    <VisualDocumentEditor<EmailPayload>
      apiPath={`/api/puck/emails/${emailId}`}
      autosave
      blockSchema={blockSchema}
      config={config}
      documentType="email"
      externalBusy={emailStatus === 'checkingLinks' || emailStatus === 'sending'}
      externalMessage={emailStatus === 'checkingLinks'
        ? 'Checking links...'
        : emailStatus === 'sending'
          ? 'Sending test email...'
          : emailMessage}
      externalStatus={emailStatus === 'idle' ? null : emailStatus}
      headerTitle={`Email Builder: ${title}`}
      initialData={initialData}
      loadingLabel="Loading email builder..."
      onLoadPayload={captureEmailPayload}
      palette={{
        contentDescription: 'Drag content blocks into the email canvas.',
        contentSlugs: contentPaletteSlugs,
        contentTitle: 'Content Blocks',
        items: EMAIL_PALETTE_ITEMS,
        rowDescription: 'Drag row layouts into the email canvas.',
        rowSlugs: rowPaletteSlugs,
        rowTitle: 'Add Rows',
        rowsPlaceholder: <SavedRowPlaceholder />,
      }}
      previewFrameStyle={{
        background: '#f6f7f9',
        color: '#111827',
        fontFamily: 'Arial, Helvetica, sans-serif',
        minHeight: '100%',
      }}
      renderHeaderActions={(context) => {
        const busy = context.status === 'saving' || emailStatus === 'sending' || emailStatus === 'checkingLinks'

        return (
          <>
            <button
              className={styles.saveButton}
              disabled={busy}
              type="button"
              onClick={() => void context.save(context.data)}
            >
              {context.status === 'saving' ? 'Saving...' : 'Save'}
            </button>
            <button
              className={styles.saveButton}
              disabled={busy}
              type="button"
              onClick={() => void checkLinks(context)}
            >
              {emailStatus === 'checkingLinks' ? 'Checking Links...' : 'Check Links'}
            </button>
            <button
              className={styles.saveButton}
              disabled={busy}
              type="button"
              onClick={() => {
                setTestEmailPanelOpen(true)
                setTestEmailError(null)
              }}
            >
              {emailStatus === 'sending' ? 'Sending Test Email...' : 'Send Test Email'}
            </button>
            <button
              className={styles.saveButton}
              disabled={busy}
              type="button"
              onClick={() => continueToAudience(context)}
            >
              Next: Audience
            </button>
          </>
        )
      }}
      rows={EMAIL_ROWS}
      saveErrorMessage="Unable to save email"
      savedMessage="Email draft autosaved."
      savingMessage="Autosaving draft..."
      sidePanel={(context) => testEmailPanelOpen || linkCheck || emailStatus === 'checkingLinks' ? (
        <div className={styles.emailBuilderFloatingPanels}>
          {testEmailPanelOpen ? (
            <aside className={styles.emailBuilderTestPanel}>
              <div className={styles.emailBuilderLinkPanelHeader}>
                <strong>Send Test Email</strong>
                <button
                  aria-label="Close test email panel"
                  disabled={emailStatus === 'sending' || emailStatus === 'checkingLinks'}
                  type="button"
                  onClick={() => {
                    setTestEmailPanelOpen(false)
                    setTestEmailError(null)
                  }}
                >
                  Close
                </button>
              </div>
              <label>
                <span>Recipient email</span>
                <input
                  autoFocus
                  disabled={emailStatus === 'sending' || emailStatus === 'checkingLinks'}
                  inputMode="email"
                  type="email"
                  value={testEmailRecipient}
                  onChange={(event) => {
                    setTestEmailRecipient(event.target.value)
                    setTestEmailError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void sendTestEmail(context, testEmailRecipient)
                    }
                  }}
                />
              </label>
              {testEmailError ? <p data-state="error">{testEmailError}</p> : null}
              <div className={styles.emailBuilderTestPanelActions}>
                <button
                  disabled={emailStatus === 'sending' || emailStatus === 'checkingLinks'}
                  type="button"
                  onClick={() => void sendTestEmail(context, testEmailRecipient)}
                >
                  {emailStatus === 'sending' ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </aside>
          ) : null}
          {linkCheck || emailStatus === 'checkingLinks' ? (
            <aside className={styles.emailBuilderLinkPanel} data-state={blockingLinks.length ? 'error' : 'ok'}>
              <div className={styles.emailBuilderLinkPanelHeader}>
                <strong>Link Check</strong>
                <span>
                  {emailStatus === 'checkingLinks'
                    ? 'Checking...'
                    : blockingLinks.length
                      ? `${blockingLinks.length} blocking`
                      : reviewLinks.length
                        ? `${reviewLinks.length} warning${reviewLinks.length === 1 ? '' : 's'}`
                        : `${links.length} checked`}
                </span>
              </div>
              {linkCheckMessage ? <p>{linkCheckMessage}</p> : null}
              {reviewLinks.length ? (
                <div className={styles.emailBuilderLinkList}>
                  {reviewLinks.slice(0, 6).map((link, index) => (
                    <div key={`${link.href}-${index}`} data-state={link.status}>
                      <strong>{link.label || 'Link'}</strong>
                      <span>{link.href || 'Missing URL'}</span>
                      <em>{link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || link.status}</em>
                      {link.status === 'warning' ? (
                        <button type="button" onClick={() => void confirmLink(context, link)}>
                          Confirm link
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      ) : null}
      statusMessage={(context) => emailStatus === 'checkingLinks'
        ? 'Checking links...'
        : emailStatus === 'sending'
          ? 'Sending test email...'
          : context.isDirty
            ? 'Autosave pending...'
            : emailMessage}
      toolbar
      viewports={[
        { width: 390, height: 'auto', label: 'Mobile' },
        { width: 640, height: 'auto', label: 'Email' },
      ]}
    />
  )
}
