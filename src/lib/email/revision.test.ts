import { describe, expect, it } from 'vitest'

import {
  computeEmailContentRevision,
  computeEmailRenderedContentRevision,
  didEmailSendContentChange,
} from './revision'

describe('email content revisions', () => {
  const base = {
    emailList: 'list-1',
    layout: [
      {
        blockType: 'emailText',
        text: {
          root: {
            children: [{ text: 'Hello', type: 'text' }],
            type: 'root',
          },
        },
      },
    ],
    preheader: 'Preview',
    replyTo: 'Replies@Example.com',
    subject: 'Subject',
    tenant: 'tenant-1',
  }

  it('is stable across object key order and normalizes reply-to casing', () => {
    const reordered = {
      tenant: 'tenant-1',
      subject: 'Subject',
      replyTo: 'replies@example.com',
      preheader: 'Preview',
      layout: base.layout,
      emailList: 'list-1',
    }
    expect(computeEmailContentRevision(reordered)).toBe(computeEmailContentRevision(base))
  })

  it('changes only when send content changes', () => {
    expect(didEmailSendContentChange({ title: 'Internal title' }, base)).toBe(false)
    expect(didEmailSendContentChange({ subject: 'Changed subject' }, base)).toBe(true)
  })

  it('invalidates delivery review when rendered footer or sender context changes', () => {
    const rendered = {
      audienceListId: 'list-1',
      fromEmail: 'sender@example.com',
      fromName: 'District Office',
      html: '<main>Hello</main><footer>10 Main Street</footer>',
      preheader: 'Preview',
      replyTo: 'reply@example.com',
      subject: 'Subject',
      tenantId: 'tenant-1',
      text: 'Hello\n10 Main Street',
    }
    const revision = computeEmailRenderedContentRevision(rendered)

    expect(computeEmailRenderedContentRevision({
      ...rendered,
      html: '<main>Hello</main><footer>20 Main Street</footer>',
      text: 'Hello\n20 Main Street',
    })).not.toBe(revision)
    expect(computeEmailRenderedContentRevision({
      ...rendered,
      fromEmail: 'new-sender@example.com',
    })).not.toBe(revision)
  })

  it('normalizes the request origin without ignoring other rendered links', () => {
    const first = computeEmailRenderedContentRevision({
      html: '<a href="https://admin.example.com/api/emails/web-version/1">View</a><a href="https://external.example/a">External</a>',
      origin: 'https://admin.example.com',
      subject: 'Subject',
      text: 'https://admin.example.com/api/emails/web-version/1',
    })
    const second = computeEmailRenderedContentRevision({
      html: '<a href="https://cron.example.com/api/emails/web-version/1">View</a><a href="https://external.example/a">External</a>',
      origin: 'https://cron.example.com',
      subject: 'Subject',
      text: 'https://cron.example.com/api/emails/web-version/1',
    })
    const changedExternal = computeEmailRenderedContentRevision({
      html: '<a href="https://cron.example.com/api/emails/web-version/1">View</a><a href="https://external.example/b">External</a>',
      origin: 'https://cron.example.com',
      subject: 'Subject',
      text: 'https://cron.example.com/api/emails/web-version/1',
    })

    expect(second).toBe(first)
    expect(changedExternal).not.toBe(first)
  })
})
