'use client'

import React, { useMemo } from 'react'

import {
  createPuckBuilderConfig,
  PuckBuilderShell,
  SavedRowPlaceholder,
  type PuckBuilderContext,
  type VisualPaletteItem,
  type VisualRowPreset,
} from '@/components/admin/puck/PuckBuilderShell'
import { EmailComposeStageJourney } from '@/components/admin/email-workflow/EmailComposeStageJourney'
import { flushEmailComposeSettings } from '@/components/admin/email-workflow/emailComposeSettingsBridge'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import type { PuckBlockSchema, PuckEmailDoc, PuckPageData } from '@/lib/puck/types'

import { PuckEmailBlockPreview } from './PuckEmailBlockPreview'

const EMAIL_ROW_DROPZONE_MIN_HEIGHT = 176

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

export function PuckEmailBuilderEditor({
  blockSchema,
  emailId,
  initialData,
  title,
}: PuckEmailBuilderProps) {
  const contentPaletteSlugs = useMemo(() => getContentPaletteSlugs(blockSchema), [blockSchema])
  const rowPaletteSlugs = useMemo(() => getRowPaletteSlugs(blockSchema), [blockSchema])
  const config = useMemo(
    () => createPuckBuilderConfig({
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
  async function continueToAudience(context: PuckBuilderContext<EmailPayload>) {
    const [contentSaved, settingsSaved] = await Promise.all([
      context.saveLatestData(),
      flushEmailComposeSettings(emailId),
    ])
    if (contentSaved && settingsSaved) {
      window.location.assign(`/admin/collections/emails/${emailId}/audience`)
    }
  }

  return (
    <PuckBuilderShell<EmailPayload>
      apiPath={`/api/puck/emails/${emailId}`}
      autosave
      blockSchema={blockSchema}
      config={config}
      documentId={emailId}
      documentTitle={title}
      documentType="email"
      headerTitle={`Email Builder: ${title}`}
      initialData={initialData}
      loadingLabel="Loading email builder..."
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
        const busy = context.status === 'saving'

        return (
          <button
            className={styles.saveButton}
            disabled={busy}
            type="button"
            onClick={() => void continueToAudience(context)}
          >
            {context.status === 'saving' ? 'Saving…' : 'Continue to Audience'}
          </button>
        )
      }}
      rows={EMAIL_ROWS}
      saveErrorMessage="Unable to save email"
      savedMessage="Email draft autosaved."
      savingMessage="Autosaving draft..."
      statusMessage={(context) => context.isDirty ? 'Autosave pending...' : null}
      toolbar
      workspaceLabel="Compose · Email Campaign"
      workspaceNavigation={<EmailComposeStageJourney emailId={emailId} />}
      viewports={[
        { width: 390, height: 'auto', label: 'Mobile' },
        { width: 640, height: 'auto', label: 'Email' },
      ]}
    />
  )
}
