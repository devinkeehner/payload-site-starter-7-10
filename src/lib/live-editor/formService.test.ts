import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { formFieldsToEditorLayout } from './formDocument'
import { getEditorForm, saveEditorForm } from './formService'

const updatedAt = '2026-11-20T12:00:00.000Z'
const nextUpdatedAt = '2026-11-20T12:01:00.000Z'

function fixture(mediaTenant = 'site-a') {
  const current = {
    id: 'form-a',
    tenant: { id: 'site-a', name: 'Site A' },
    title: 'Original title',
    fields: [{ id: 'text-a', blockType: 'text', name: 'original_field_name', width: 50 }],
    confirmationType: 'message',
    emails: [{ emailTo: 'notify@example.org' }],
    updatedAt,
  }
  const findByID = vi.fn(async ({ collection }: { collection: string }) =>
    collection === 'forms' ? current : { id: 'media-a', tenant: mediaTenant },
  )
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    docs: [{ ...current, ...data, updatedAt: nextUpdatedAt }],
    errors: [],
  }))
  const req = {
    user: { roles: ['admin'] },
    payload: {
      config: {
        collections: [{
          slug: 'forms',
          fields: [{
            name: 'fields',
            type: 'blocks',
            blocks: [{
              slug: 'image-select',
              fields: [{
                name: 'options',
                type: 'array',
                fields: [{ name: 'image', type: 'upload', relationTo: 'media' }],
              }],
            }],
          }],
        }],
      },
      findByID,
      update,
    },
  } as unknown as PayloadRequest
  return { current, req, findByID, update }
}

describe('form editor persistence', () => {
  it('loads the builder for existing staff and omits advanced settings from the response', async () => {
    const { req, findByID } = fixture()
    const { form, schemas } = await getEditorForm(req, 'form-a')

    expect(form).toMatchObject({ id: 'form-a', title: 'Original title', tenantName: 'Site A' })
    expect(form).not.toHaveProperty('emails')
    expect(schemas).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'text' })]))
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ req, overrideAccess: false }))
  })

  it('conditionally saves native fields with media IDs and preserves stored submission keys', async () => {
    const { current, req, update } = fixture()
    const imageChoice = {
      id: 'image-select-a',
      blockType: 'image-select',
      label: 'Choose an image',
      name: 'imageChoice',
      width: 100,
      options: [{ label: 'Image A', value: 'image-a', image: { id: 'media-a', url: '/image-a.png' } }],
    }
    const result = await saveEditorForm(req, 'form-a', {
      expectedUpdatedAt: updatedAt,
      form: { title: 'Updated title', redirect: { url: null }, layout: formFieldsToEditorLayout([...current.fields, imageChoice]) },
    })

    expect(result.form.updatedAt).toBe(nextUpdatedAt)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'forms',
      overrideAccess: false,
      overrideLock: false,
      where: { and: [{ id: { equals: 'form-a' } }, { updatedAt: { equals: updatedAt } }] },
      data: {
        title: 'Updated title',
        fields: [
          current.fields[0],
          { ...imageChoice, options: [{ label: 'Image A', value: 'image-a', image: 'media-a' }] },
        ],
      },
    }))
  })

  it('rejects stale saves and attempts to change advanced settings', async () => {
    const { req, update } = fixture()
    await expect(saveEditorForm(req, 'form-a', {
      expectedUpdatedAt: nextUpdatedAt, form: { title: 'Stale update' },
    })).rejects.toMatchObject({ status: 409 })
    await expect(saveEditorForm(req, 'form-a', {
      expectedUpdatedAt: updatedAt, form: { emails: [] },
    })).rejects.toMatchObject({ status: 400 })
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects new image choices from another site', async () => {
    const { req, update } = fixture('site-b')
    await expect(saveEditorForm(req, 'form-a', {
      expectedUpdatedAt: updatedAt,
      form: {
        layout: [{
          blockType: 'image-select',
          name: 'imageChoice',
          options: [{ label: 'Image A', value: 'image-a', image: 'media-a' }],
        }],
      },
    })).rejects.toMatchObject({ status: 403 })
    expect(update).not.toHaveBeenCalled()
  })
})
