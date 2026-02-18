import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { resendAdapter } from '@payloadcms/email-resend';
import sharp from 'sharp';
import path from 'path';
import { buildConfig, PayloadRequest, type GlobalConfig } from 'payload';
import { fileURLToPath } from 'url';
import { s3Storage } from '@payloadcms/storage-s3';
import { mcpPlugin } from '@payloadcms/plugin-mcp';
import { z } from 'zod';

// Collection imports
import { Tenants } from './collections/Tenants';
import { Categories } from './collections/Categories';
import { Media } from './collections/Media';
import { Pages } from './collections/Pages';
import { Posts } from './collections/Posts';
import { Users } from './collections/Users';
import { Authors } from './collections/Authors';
import { Tags } from './collections/Tags';
import { ArticleTypes } from './collections/ArticleTypes';
import { WordpressPosts } from './collections/WordpressPosts';

// Site settings and other component imports
import { Navbar } from './components/site/navbar/config';
import { StandardMedia } from './collections/StandardMedia';
import { MediaCanvas } from './collections/MediaCanvas';
import { RepInfo } from './collections/RepInfo';
import { SiteSEO } from './collections/SiteSEO';
import { Header } from './components/site/header/config';
import { Footer } from './components/site/footer/config';

// Misc imports
import { plugins } from '@/lib/plugins';
import { defaultLexical } from '@/collections/fields/defaultLexical';
import { isSuperUser } from '@/lib/access/isSuperUser';

// Inline Global Meta & SEO (Payload Global - site-wide)
const GlobalMetaSEOGlobal: GlobalConfig = {
  slug: 'global-meta-seo',
  label: 'Global Meta & SEO',
  admin: {
    group: 'Admin',
    hidden: ({ user }) => !isSuperUser(user),
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'gtmHeader',
      label: 'Google Tag Manager Header',
      type: 'textarea',
      admin: {
        description: 'Paste the GTM header script block. <script> wrappers are okay.',
      },
    },
    {
      name: 'siteJsonLd',
      label: 'Site JSON-LD',
      type: 'textarea',
      admin: {
        description: 'Paste the structured data JSON-LD without <script> tags.',
      },
    },
    {
      name: 'gtmBodyNoscript',
      label: 'Google Tag Manager Body (noscript)',
      type: 'textarea',
      admin: {
        description: 'Paste the GTM <noscript> iframe block.',
      },
    },
  ],
};

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const mongoPoolConfig = {
  maxPoolSize: parsePositiveInt(process.env.MONGODB_MAX_POOL_SIZE, 10),
  minPoolSize: parsePositiveInt(process.env.MONGODB_MIN_POOL_SIZE, 0),
  maxConnecting: parsePositiveInt(process.env.MONGODB_MAX_CONNECTING, 2),
  serverSelectionTimeoutMS: parsePositiveInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 15000),
  socketTimeoutMS: parsePositiveInt(process.env.MONGODB_SOCKET_TIMEOUT_MS, 45000),
} as const;

const mcpCollections = {
  posts: { enabled: { find: true, create: true, update: true, delete: true } },
  pages: { enabled: { find: true, create: true, update: true, delete: true } },
  forms: { enabled: { find: true, create: true, update: true, delete: true } },
  'form-submissions': { enabled: { find: true, create: true, update: true, delete: true } },
  media: { enabled: { find: true, create: true, update: true, delete: true } },
  categories: { enabled: { find: true, create: true, update: true, delete: true } },
  'article-types': { enabled: { find: true, create: true, update: true, delete: true } },
  authors: { enabled: { find: true, create: true, update: true, delete: true } },
  tags: { enabled: { find: true, create: true, update: true, delete: true } },
  'site-seo': { enabled: { find: true, create: true, update: true, delete: true } },
  'rep-info': { enabled: { find: true, create: true, update: true, delete: true } },
  'standard-media': { enabled: { find: true, create: true, update: true, delete: true } },
  'media-canvas': { enabled: { find: true, create: true, update: true, delete: true } },
} as const;

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aEntries = Object.entries(a as Record<string, unknown>).sort(([aKey], [bKey]) =>
      aKey.localeCompare(bKey),
    );
    const bEntries = Object.entries(b as Record<string, unknown>).sort(([aKey], [bKey]) =>
      aKey.localeCompare(bKey),
    );
    if (aEntries.length !== bEntries.length) return false;
    return aEntries.every(([key, value], index) => {
      const [bKey, bValue] = bEntries[index] || [];
      return key === bKey && deepEqual(value, bValue);
    });
  }

  return false;
};

const getTenantMeta = (tenantValue: unknown) => {
  if (!tenantValue) {
    return { tenantId: null, tenantSlug: null, tenantName: null };
  }

  if (typeof tenantValue === 'string' || typeof tenantValue === 'number') {
    return {
      tenantId: String(tenantValue),
      tenantSlug: null,
      tenantName: null,
    };
  }

  if (typeof tenantValue === 'object') {
    const tenantObj = tenantValue as Record<string, unknown>;
    return {
      tenantId: tenantObj.id ? String(tenantObj.id) : null,
      tenantSlug: typeof tenantObj.slug === 'string' ? tenantObj.slug : null,
      tenantName: typeof tenantObj.name === 'string' ? tenantObj.name : null,
    };
  }

  return { tenantId: null, tenantSlug: null, tenantName: null };
};

const bulkUpdateFormsByTitleTool = {
  name: 'bulkUpdateFormsByTitle',
  description:
    'Update all forms that match a title across tenants and return changed, unchanged, and failed items.',
  parameters: {
    formTitle: z.string().min(1).describe('Exact form title to match.'),
    patch: z
      .record(z.any())
      .describe('Raw form fields to update, e.g. {"submitButtonLabel":"Send","enableTurnstile":true}.'),
    tenantIds: z
      .array(z.union([z.string(), z.number()]))
      .optional()
      .describe('Optional tenant IDs to limit updates.'),
    tenantSlugs: z
      .array(z.string())
      .optional()
      .describe('Optional tenant slugs to limit updates.'),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe('When true, reports what would change without writing updates.'),
    maxMatches: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .default(500)
      .describe('Maximum forms to scan and process.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const formTitle = typeof args.formTitle === 'string' ? args.formTitle.trim() : '';
    const patch =
      args.patch && typeof args.patch === 'object' && !Array.isArray(args.patch)
        ? (args.patch as Record<string, unknown>)
        : null;
    const dryRun = typeof args.dryRun === 'boolean' ? args.dryRun : false;
    const maxMatches =
      typeof args.maxMatches === 'number' && Number.isFinite(args.maxMatches)
        ? Math.max(1, Math.min(5000, Math.trunc(args.maxMatches)))
        : 500;

    if (!formTitle) {
      return {
        content: [{ type: 'text' as const, text: 'Error: `formTitle` is required.' }],
      };
    }

    if (!patch || Object.keys(patch).length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'Error: `patch` must be a non-empty object.' }],
      };
    }

    if ('tenant' in patch) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: `patch.tenant` is not allowed in bulk updates.',
          },
        ],
      };
    }

    const rawTenantIds = Array.isArray(args.tenantIds)
      ? args.tenantIds
          .map((id) => (id == null ? '' : String(id).trim()))
          .filter((id) => id.length > 0)
      : [];

    const rawTenantSlugs = Array.isArray(args.tenantSlugs)
      ? args.tenantSlugs
          .map((slug) => (typeof slug === 'string' ? slug.trim() : ''))
          .filter((slug) => slug.length > 0)
      : [];

    try {
      const tenantIds = new Set<string>(rawTenantIds);
      const missingTenantSlugs: string[] = [];

      if (rawTenantSlugs.length > 0) {
        const tenants = await payload.find({
          collection: 'tenants',
          limit: Math.max(rawTenantSlugs.length, 100),
          overrideAccess: true,
          req,
          where: {
            slug: { in: rawTenantSlugs },
          },
        });

        const foundSlugSet = new Set<string>();
        for (const tenantDoc of tenants.docs as unknown as Array<Record<string, unknown>>) {
          if (tenantDoc.id) {
            tenantIds.add(String(tenantDoc.id));
          }
          if (typeof tenantDoc.slug === 'string') {
            foundSlugSet.add(tenantDoc.slug);
          }
        }

        for (const slug of rawTenantSlugs) {
          if (!foundSlugSet.has(slug)) {
            missingTenantSlugs.push(slug);
          }
        }
      }

      const whereFilters: Array<Record<string, unknown>> = [{ title: { equals: formTitle } }];
      if (tenantIds.size > 0) {
        whereFilters.push({ tenant: { in: Array.from(tenantIds) } });
      }

      const where: any = whereFilters.length > 1 ? { and: whereFilters } : whereFilters[0];

      const changed: Array<Record<string, unknown>> = [];
      const unchanged: Array<Record<string, unknown>> = [];
      const failed: Array<Record<string, unknown>> = [];

      let page = 1;
      let processed = 0;
      let totalFound = 0;
      let done = false;

      while (!done) {
        const result = await payload.find({
          collection: 'forms',
          depth: 1,
          limit: Math.min(100, maxMatches),
          page,
          overrideAccess: true,
          req,
          where,
        });

        if (page === 1) {
          totalFound = result.totalDocs;
        }

        if (result.docs.length === 0) {
          break;
        }

        for (const formDoc of result.docs as unknown as Array<Record<string, unknown>>) {
          if (processed >= maxMatches) {
            done = true;
            break;
          }
          processed += 1;

          const { tenantId, tenantName, tenantSlug } = getTenantMeta(formDoc.tenant);
          const formId = formDoc.id ? String(formDoc.id) : null;
          const currentMatchesPatch = Object.entries(patch).every(([field, newValue]) =>
            deepEqual(formDoc[field], newValue),
          );

          const baseRow = {
            formId,
            title: typeof formDoc.title === 'string' ? formDoc.title : null,
            tenantId,
            tenantSlug,
            tenantName,
          };

          if (currentMatchesPatch) {
            unchanged.push(baseRow);
            continue;
          }

          if (dryRun) {
            changed.push({ ...baseRow, dryRun: true });
            continue;
          }

          try {
            await payload.update({
              collection: 'forms',
              id: formId as string,
              data: patch as any,
              overrideAccess: true,
              req,
            } as any);

            changed.push({ ...baseRow, dryRun: false });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            failed.push({ ...baseRow, error: message });
          }
        }

        if (done || page >= result.totalPages) {
          break;
        }
        page += 1;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                formTitle,
                dryRun,
                maxMatches,
                totalFound,
                processed,
                changedCount: changed.length,
                unchangedCount: unchanged.length,
                failedCount: failed.length,
                missingTenantSlugs,
                changed,
                unchanged,
                failed,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Error bulk updating forms: ${message}` }],
      };
    }
  },
};

const reorderContactFormTailFieldsTool = {
  name: 'reorderContactFormTailFields',
  description:
    'For contact forms, move the `other` textarea and `image-select` field into the final two positions in a configurable order across tenants.',
  parameters: {
    formTitleContains: z
      .string()
      .optional()
      .default('contact')
      .describe('Case-insensitive title fragment used to identify contact forms.'),
    otherFieldName: z
      .string()
      .optional()
      .default('other')
      .describe('Field name for the textarea field to reposition.'),
    imageSelectFieldName: z
      .string()
      .optional()
      .describe(
        'Optional field name for the image-select field. If omitted, the first image-select block in the form is used.',
      ),
    lastField: z
      .enum(['other', 'image-select'])
      .optional()
      .default('image-select')
      .describe('Which field should be the final field in the form.'),
    tenantIds: z
      .array(z.union([z.string(), z.number()]))
      .optional()
      .describe('Optional tenant IDs to limit updates.'),
    tenantSlugs: z
      .array(z.string())
      .optional()
      .describe('Optional tenant slugs to limit updates.'),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe('When true, reports what would change without writing updates.'),
    maxMatches: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .default(500)
      .describe('Maximum matching forms to process.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const formTitleContains =
      typeof args.formTitleContains === 'string' && args.formTitleContains.trim().length > 0
        ? args.formTitleContains.trim()
        : 'contact';
    const escapedTitleFragment = formTitleContains.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titlePattern = new RegExp(escapedTitleFragment, 'i');
    const otherFieldName =
      typeof args.otherFieldName === 'string' && args.otherFieldName.trim().length > 0
        ? args.otherFieldName.trim()
        : 'other';
    const imageSelectFieldName =
      typeof args.imageSelectFieldName === 'string' && args.imageSelectFieldName.trim().length > 0
        ? args.imageSelectFieldName.trim()
        : null;
    const lastField =
      args.lastField === 'other' || args.lastField === 'image-select'
        ? args.lastField
        : 'image-select';
    const dryRun = typeof args.dryRun === 'boolean' ? args.dryRun : false;
    const maxMatches =
      typeof args.maxMatches === 'number' && Number.isFinite(args.maxMatches)
        ? Math.max(1, Math.min(5000, Math.trunc(args.maxMatches)))
        : 500;

    const rawTenantIds = Array.isArray(args.tenantIds)
      ? args.tenantIds
          .map((id) => (id == null ? '' : String(id).trim()))
          .filter((id) => id.length > 0)
      : [];

    const rawTenantSlugs = Array.isArray(args.tenantSlugs)
      ? args.tenantSlugs
          .map((slug) => (typeof slug === 'string' ? slug.trim() : ''))
          .filter((slug) => slug.length > 0)
      : [];

    try {
      const tenantIds = new Set<string>(rawTenantIds);
      const missingTenantSlugs: string[] = [];

      if (rawTenantSlugs.length > 0) {
        const tenants = await payload.find({
          collection: 'tenants',
          limit: Math.max(rawTenantSlugs.length, 100),
          overrideAccess: true,
          req,
          where: {
            slug: { in: rawTenantSlugs },
          },
        });

        const foundSlugSet = new Set<string>();
        for (const tenantDoc of tenants.docs as unknown as Array<Record<string, unknown>>) {
          if (tenantDoc.id) {
            tenantIds.add(String(tenantDoc.id));
          }
          if (typeof tenantDoc.slug === 'string') {
            foundSlugSet.add(tenantDoc.slug);
          }
        }

        for (const slug of rawTenantSlugs) {
          if (!foundSlugSet.has(slug)) {
            missingTenantSlugs.push(slug);
          }
        }
      }

      const changed: Array<Record<string, unknown>> = [];
      const unchanged: Array<Record<string, unknown>> = [];
      const skipped: Array<Record<string, unknown>> = [];
      const failed: Array<Record<string, unknown>> = [];

      let page = 1;
      let scannedForms = 0;
      let matchedByTitle = 0;
      let processed = 0;
      let totalForms = 0;
      let done = false;

      while (!done) {
        const result = await payload.find({
          collection: 'forms',
          depth: 1,
          limit: 100,
          page,
          overrideAccess: true,
          req,
        });

        if (page === 1) {
          totalForms = result.totalDocs;
        }

        if (result.docs.length === 0) {
          break;
        }

        for (const formDoc of result.docs as unknown as Array<Record<string, unknown>>) {
          scannedForms += 1;
          const title = typeof formDoc.title === 'string' ? formDoc.title : '';
          if (!titlePattern.test(title)) {
            continue;
          }

          const { tenantId, tenantName, tenantSlug } = getTenantMeta(formDoc.tenant);
          if (tenantIds.size > 0) {
            if (!tenantId || !tenantIds.has(tenantId)) {
              continue;
            }
          }

          matchedByTitle += 1;
          if (processed >= maxMatches) {
            done = true;
            break;
          }
          processed += 1;

          const formId = formDoc.id ? String(formDoc.id) : null;
          const fields = Array.isArray(formDoc.fields) ? [...formDoc.fields] : [];

          const otherIndex = fields.findIndex(
            (field) =>
              field &&
              typeof field === 'object' &&
              (field as Record<string, unknown>).blockType === 'textarea' &&
              (field as Record<string, unknown>).name === otherFieldName,
          );

          const imageSelectIndex = fields.findIndex(
            (field) =>
              field &&
              typeof field === 'object' &&
              (field as Record<string, unknown>).blockType === 'image-select' &&
              (imageSelectFieldName == null ||
                (field as Record<string, unknown>).name === imageSelectFieldName),
          );

          const baseRow = {
            formId,
            title: title || null,
            tenantId,
            tenantSlug,
            tenantName,
            fieldCount: fields.length,
            otherIndex,
            imageSelectIndex,
          };

          if (!formId) {
            failed.push({ ...baseRow, reason: 'missing_form_id' });
            continue;
          }

          if (otherIndex === -1 || imageSelectIndex === -1) {
            skipped.push({ ...baseRow, reason: 'missing_other_or_image_select' });
            continue;
          }

          const expectedOtherIndex = lastField === 'other' ? fields.length - 1 : fields.length - 2;
          const expectedImageSelectIndex =
            lastField === 'other' ? fields.length - 2 : fields.length - 1;
          const alreadyOrdered =
            otherIndex === expectedOtherIndex && imageSelectIndex === expectedImageSelectIndex;

          if (alreadyOrdered) {
            unchanged.push(baseRow);
            continue;
          }

          const otherField = fields[otherIndex];
          const imageSelectField = fields[imageSelectIndex];
          const rebuiltFields = fields.filter(
            (_field, index) => index !== otherIndex && index !== imageSelectIndex,
          );

          if (lastField === 'other') {
            rebuiltFields.push(imageSelectField, otherField);
          } else {
            rebuiltFields.push(otherField, imageSelectField);
          }

          const changedRow = {
            ...baseRow,
            dryRun,
            newOtherIndex: lastField === 'other' ? rebuiltFields.length - 1 : rebuiltFields.length - 2,
            newImageSelectIndex:
              lastField === 'other' ? rebuiltFields.length - 2 : rebuiltFields.length - 1,
          };

          if (dryRun) {
            changed.push(changedRow);
            continue;
          }

          try {
            await payload.update({
              collection: 'forms',
              id: formId,
              data: { fields: rebuiltFields } as any,
              overrideAccess: true,
              req,
            } as any);
            changed.push(changedRow);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            failed.push({ ...baseRow, reason: message });
          }
        }

        if (done || page >= result.totalPages) {
          break;
        }
        page += 1;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                formTitleContains,
                otherFieldName,
                imageSelectFieldName,
                lastField,
                dryRun,
                maxMatches,
                totalForms,
                scannedForms,
                matchedByTitle,
                processed,
                changedCount: changed.length,
                unchangedCount: unchanged.length,
                skippedCount: skipped.length,
                failedCount: failed.length,
                missingTenantSlugs,
                changed,
                unchanged,
                skipped,
                failed,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Error reordering contact form fields: ${message}` }],
      };
    }
  },
};

const upsertPageWithBlocksTool = {
  name: 'upsertPageWithBlocks',
  description:
    'Create or update a page with raw hero/layout JSON. Use this when createPages/updatePages fail on block layout validation.',
  parameters: {
    id: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Optional page ID. If provided, updates this page directly.'),
    tenant: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Tenant ID. Required for create and slug-based upsert.'),
    title: z.string().optional().describe('Page title. Required when creating a page.'),
    slug: z.string().optional().describe('Page slug used for matching/upsert.'),
    status: z
      .enum(['draft', 'published'])
      .optional()
      .default('draft')
      .describe('Document status.'),
    hero: z.record(z.any()).optional().describe('Raw hero object, e.g. {"type":"none"}.'),
    layout: z.array(z.any()).optional().describe('Raw block layout array.'),
    meta: z.record(z.any()).optional().describe('Optional SEO meta object.'),
    publishedAt: z.string().optional().describe('Optional ISO datetime.'),
    matchBySlugAndTenant: z
      .boolean()
      .optional()
      .default(true)
      .describe('When no ID is provided, update existing page by tenant+slug before creating.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const id = args.id != null ? String(args.id) : undefined;
    const tenant = args.tenant != null ? String(args.tenant) : undefined;
    const title = typeof args.title === 'string' ? args.title : undefined;
    const slug = typeof args.slug === 'string' ? args.slug : undefined;

    const parseJSONIfString = <T>(value: unknown): T | unknown => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value;
      }
    };

    const hero = parseJSONIfString<Record<string, unknown>>(args.hero);
    const meta = parseJSONIfString<Record<string, unknown>>(args.meta);
    const layout = Array.isArray(args.layout)
      ? args.layout.map((item) => parseJSONIfString<Record<string, unknown>>(item))
      : undefined;

    const publishedAt = typeof args.publishedAt === 'string' ? args.publishedAt : undefined;
    const status =
      args.status === 'published' || args.status === 'draft' ? args.status : 'draft';
    const matchBySlugAndTenant =
      typeof args.matchBySlugAndTenant === 'boolean' ? args.matchBySlugAndTenant : true;

    if (!id && !tenant) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: `tenant` is required when `id` is not provided.',
          },
        ],
      };
    }

    const data: Record<string, unknown> = { _status: status };
    if (title !== undefined) data.title = title;
    if (slug !== undefined) data.slug = slug;
    if (hero !== undefined) data.hero = hero;
    if (layout !== undefined) data.layout = layout;
    if (meta !== undefined) data.meta = meta;
    if (publishedAt !== undefined) data.publishedAt = publishedAt;

    try {
      let action: 'created' | 'updated' = 'created';
      let result: Record<string, unknown> | null = null;

      if (id) {
        action = 'updated';
        result = (await payload.update({
          collection: 'pages',
          id,
          data,
          draft: status !== 'published',
          overrideAccess: true,
          req,
        })) as unknown as Record<string, unknown>;
      } else {
        let targetId: string | null = null;

        if (matchBySlugAndTenant && tenant && slug) {
          const existing = await payload.find({
            collection: 'pages',
            limit: 1,
            req,
            overrideAccess: true,
            where: {
              and: [{ tenant: { equals: tenant } }, { slug: { equals: slug } }],
            },
          });
          if (existing.docs.length > 0 && existing.docs[0]?.id) {
            targetId = String(existing.docs[0].id);
          }
        }

        if (targetId) {
          action = 'updated';
          result = (await payload.update({
            collection: 'pages',
            id: targetId,
            data,
            draft: status !== 'published',
            overrideAccess: true,
            req,
          })) as unknown as Record<string, unknown>;
        } else {
          if (!title) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: `title` is required when creating a page.',
                },
              ],
            };
          }

          const createData: Record<string, unknown> = {
            ...data,
            tenant,
          };

          action = 'created';
          result = (await payload.create({
            collection: 'pages',
            data: createData,
            draft: status !== 'published',
            overrideAccess: true,
            req,
          } as any)) as unknown as Record<string, unknown>;
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                action,
                id: result?.id ?? null,
                title: result?.title ?? null,
                slug: result?.slug ?? null,
                status: result?._status ?? null,
                tenant: result?.tenant ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Error upserting page: ${message}` }],
      };
    }
  },
};

export default buildConfig({
  admin: {
    components: {
      // Wrap the admin UI with providers for tenant UX
      providers: [
        '@/components/admin/TenantSwitchGuard#default',
        '@/components/admin/TenantHeaderIndicator#default',
      ],
      beforeNavLinks: ['@/components/admin/TenantNavPanel#default'],
      graphics: {
        Icon: '@/components/admin/brand/Icon#default',
        Logo: '@/components/admin/brand/Logo#default',
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    suppressHydrationWarning: true,
    user: Users.slug,
    livePreview: {
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 375, height: 667 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
      ],
    },
    meta: {
      icons: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          url: '/brand/icon-light.svg',
        },
      ],
    },
  },

  // Default editor configuration (Lexical)
  editor: defaultLexical,

  // Database configuration
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || '',
    connectOptions: mongoPoolConfig,
  }),

  email: resendAdapter({
    defaultFromAddress: process.env.RESEND_FROM_EMAIL || '',
    defaultFromName: process.env.RESEND_FROM_NAME || '',
    apiKey: process.env.RESEND_API_KEY || '',
  }),

  // Define collections in the desired order; forms will be inserted later.
  collections: [
    // Content
    Posts,
    Pages,
    Media,
    MediaCanvas,
    WordpressPosts,
    // Site Settings
    RepInfo,
    Navbar,
    StandardMedia,
    SiteSEO,
    // Admin
    Categories,
    ArticleTypes,
    Users,
    Tenants,
    // Misc
    Authors,
    Tags,
  ],

  cors: {
    origins: ['https://www.cthousegop.com', 'https://cthousegop.com', 'http://localhost:3000'],
    headers: ['Content-Type', 'Authorization', 'x-turnstile-token'],
  },

  globals: [Header, Footer, GlobalMetaSEOGlobal],

  plugins: [
    mcpPlugin({
      // Official MCP plugin is enabled only when explicitly toggled on.
      disabled: process.env.PAYLOAD_ENABLE_MCP !== 'true',
      collections: mcpCollections,
      mcp: {
        tools: [upsertPageWithBlocksTool, bulkUpdateFormsByTitleTool, reorderContactFormTailFieldsTool],
      },
    }),

    // Spread any additional plugins you’ve defined elsewhere
    ...plugins,
    // Inline plugin to reposition the form collections right after the last Site Settings collection.
    (config) => {
      const all = Array.isArray(config.collections) ? [...config.collections] : [];

      const forms = all.find((c) => c.slug === 'forms');
      const submissions = all.find((c) => c.slug === 'form-submissions');

      const filtered = all.filter(
        (c) => !['forms', 'form-submissions'].includes(c.slug),
      );

      // Adjust 'site-seo' if your SiteSEO collection uses a different slug.
      const siteIndex = filtered.findIndex((c) => c.slug === 'site-seo');

      if (forms) {
        forms.admin = {
          ...(forms.admin || {}),
          components: {
            ...(forms.admin?.components || {}),
            views: {
              ...(forms.admin?.components?.views || {}),
              list: {
                ...(forms.admin?.components?.views?.list || {}),
                Component: '@/components/admin/FormResultsDashboard#default',
              },
            },
          },
        }
      }

      if (siteIndex !== -1 && forms && submissions) {
        filtered.splice(siteIndex + 1, 0, forms, submissions);
      }

      config.collections = filtered;
      return config;
    },

    // S3 storage plugin for media uploads
    s3Storage({
      collections: {
        media: {
          // Keep prefix static here; per-tenant subfolder is provided by importer via file.prefix
          prefix: '',
        },
      },
      bucket: process.env.R2_BUCKET || '',
      clientUploads: false,
      config: {
        endpoint: process.env.R2_ENDPOINT || '',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        region: 'auto',
        forcePathStyle: true,
      },
    }),
  ],

  secret: process.env.PAYLOAD_SECRET || '',

  sharp,

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged-in users by default
        if (req.user) return true;

        // Allow Vercel cron jobs via a secret token
        const authHeader = req.headers.get('authorization');
        return authHeader === `Bearer ${process.env.CRON_SECRET}`;
      },
    },
    tasks: [],
  },
});
