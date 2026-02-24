import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { resendAdapter } from '@payloadcms/email-resend';
import sharp from 'sharp';
import path from 'path';
import { buildConfig, PayloadRequest, type GlobalConfig, type Where } from 'payload';
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
import { IContactFolders } from './collections/IContactFolders';
import { IContactLists } from './collections/IContactLists';

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
import {
  getIContactConfigFromEnv,
  listIContactClientFolders,
  listIContactLists,
  refreshIContactCache,
  resolveIContactAccountId,
  syncSubmissionToIContact,
} from '@/lib/icontact';

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
  'icontact-folders': { enabled: { find: true, create: true, update: true, delete: true } },
  'icontact-lists': { enabled: { find: true, create: true, update: true, delete: true } },
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

const cloneValue = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const parsePathSegments = (path: string): Array<string | number> => {
  const trimmed = path.trim();
  if (!trimmed) throw new Error('Path cannot be empty.');

  const segments: Array<string | number> = [];
  const parts = trimmed.split('.');

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) throw new Error(`Invalid path segment in "${path}".`);

    const regex = /([^[\]]+)|\[(\d+)\]/g;
    let hasMatch = false;
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(part)) !== null) {
      hasMatch = true;
      if (match[1]) {
        segments.push(match[1]);
      } else if (match[2]) {
        segments.push(Number.parseInt(match[2], 10));
      }
    }

    if (!hasMatch) {
      throw new Error(`Invalid path part "${part}" in "${path}".`);
    }
  }

  return segments;
};

const ensureContainer = (
  current: unknown,
  nextSegment: string | number | undefined,
): Record<string, unknown> | Array<unknown> => {
  if (nextSegment == null) {
    return (current as Record<string, unknown>) ?? {};
  }
  return typeof nextSegment === 'number' ? [] : {};
};

const setAtPath = (
  target: Record<string, unknown> | Array<unknown>,
  segments: Array<string | number>,
  value: unknown,
  createMissing: boolean,
) => {
  if (segments.length === 0) throw new Error('Path cannot be empty.');

  let cursor: Record<string, unknown> | Array<unknown> = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!;
    const nextSegment = segments[i + 1];

    if (typeof segment === 'string') {
      if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) {
        throw new Error(`Cannot traverse "${segment}" on non-object path segment.`);
      }
      let nextValue = (cursor as Record<string, unknown>)[segment];
      if (nextValue == null) {
        if (!createMissing) {
          throw new Error(`Path segment "${segment}" does not exist.`);
        }
        nextValue = ensureContainer(nextValue, nextSegment);
        (cursor as Record<string, unknown>)[segment] = nextValue;
      }
      cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | Array<unknown>;
      continue;
    }

    if (!Array.isArray(cursor)) {
      throw new Error(`Cannot traverse index [${segment}] on non-array path segment.`);
    }

    if ((cursor as Array<unknown>)[segment] == null) {
      if (!createMissing) {
        throw new Error(`Path index [${segment}] does not exist.`);
      }
      (cursor as Array<unknown>)[segment] = ensureContainer((cursor as Array<unknown>)[segment], nextSegment);
    }
    cursor = (cursor as Array<unknown>)[segment] as Record<string, unknown> | Array<unknown>;
  }

  const last = segments[segments.length - 1]!;
  if (typeof last === 'string') {
    if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) {
      throw new Error(`Cannot set property "${last}" on non-object value.`);
    }
    (cursor as Record<string, unknown>)[last] = value;
    return;
  }

  if (!Array.isArray(cursor)) {
    throw new Error(`Cannot set index [${last}] on non-array value.`);
  }
  (cursor as Array<unknown>)[last] = value;
};

const unsetAtPath = (
  target: Record<string, unknown> | Array<unknown>,
  segments: Array<string | number>,
) => {
  if (segments.length === 0) throw new Error('Path cannot be empty.');

  let cursor: Record<string, unknown> | Array<unknown> | undefined = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!;

    if (typeof segment === 'string') {
      if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) return;
      cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined;
      continue;
    }

    if (!Array.isArray(cursor)) return;
    cursor = (cursor as Array<unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined;
  }

  const last = segments[segments.length - 1]!;
  if (typeof last === 'string') {
    if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) return;
    delete (cursor as Record<string, unknown>)[last];
    return;
  }

  if (!Array.isArray(cursor)) return;
  if (last >= 0 && last < (cursor as Array<unknown>).length) {
    (cursor as Array<unknown>)[last] = undefined;
  }
};

const removeAtPath = (
  target: Record<string, unknown> | Array<unknown>,
  segments: Array<string | number>,
) => {
  if (segments.length === 0) throw new Error('Path cannot be empty.');

  let cursor: Record<string, unknown> | Array<unknown> | undefined = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!;
    if (typeof segment === 'string') {
      if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) return;
      cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined;
      continue;
    }
    if (!Array.isArray(cursor)) return;
    cursor = (cursor as Array<unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined;
  }

  const last = segments[segments.length - 1]!;
  if (typeof last === 'number' && Array.isArray(cursor) && last >= 0 && last < cursor.length) {
    cursor.splice(last, 1);
    return;
  }

  unsetAtPath(target, segments);
};

const getAtPath = (
  target: Record<string, unknown> | Array<unknown>,
  segments: Array<string | number>,
): unknown => {
  let cursor: Record<string, unknown> | Array<unknown> | undefined = target;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    if (typeof segment === 'string') {
      if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) return undefined;
      cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined;
      continue;
    }

    if (!Array.isArray(cursor)) return undefined;
    cursor = (cursor as Array<unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined;
  }
  return cursor;
};

type LexicalNodeLike = Record<string, unknown> & {
  children?: LexicalNodeLike[];
  type?: string;
  text?: string;
  key?: string;
  id?: string;
};

const isLexicalDoc = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  const root = (value as Record<string, unknown>).root;
  if (!root || typeof root !== 'object') return false;
  return Array.isArray((root as Record<string, unknown>).children);
};

const loadCollectionDocument = async (
  payload: PayloadRequest['payload'],
  req: PayloadRequest,
  selector: { collection: 'pages' | 'posts'; docId?: string; slug?: string; tenant?: string },
) => {
  const { collection, docId, slug, tenant } = selector;
  if (!docId && !slug) {
    throw new Error('Provide `docId` or `slug`.');
  }

  if (docId) {
    return (await payload.findByID({
      collection,
      id: docId,
      overrideAccess: true,
      req,
    })) as unknown as Record<string, unknown>;
  }

  const where: Where = slug
    ? tenant
      ? { and: [{ slug: { equals: slug } }, { tenant: { equals: tenant } }] }
      : { slug: { equals: slug } }
    : {};

  const result = await payload.find({
    collection,
    limit: 1,
    where,
    overrideAccess: true,
    req,
  });

  return (result.docs?.[0] as unknown as Record<string, unknown>) || null;
};

const getLexicalNodeKey = (node: LexicalNodeLike): string => {
  if (typeof node.key === 'string' && node.key.trim().length > 0) return node.key;
  if (typeof node.id === 'string' && node.id.trim().length > 0) return node.id;
  return '';
};

const bulkUpdateFormsByTitleTool = {
  name: 'bulkUpdateFormsByTitle',
  description:
    'Update all forms that match a title across tenants and return changed, unchanged, and failed items.',
  parameters: {
    formTitle: z.string().min(1).describe('Exact form title to match.'),
    patch: z
      .record(z.unknown())
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

      const where: Where =
        whereFilters.length > 1
          ? ({ and: whereFilters } as Where)
          : ((whereFilters[0] ?? {}) as Where);

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
              data: patch,
              overrideAccess: true,
              req,
            });

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
              data: { fields: rebuiltFields },
              overrideAccess: true,
              req,
            });
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

const loadPageDocument = async (
  payload: PayloadRequest['payload'],
  req: PayloadRequest,
  selector: { pageId?: string; slug?: string; tenant?: string },
) => {
  const { pageId, slug, tenant } = selector;
  if (!pageId && !slug) {
    throw new Error('Provide `pageId` or `slug`.');
  }

  if (pageId) {
    return (await payload.findByID({
      collection: 'pages',
      id: pageId,
      overrideAccess: true,
      req,
    })) as unknown as Record<string, unknown>;
  }

  const where: Where = slug
    ? tenant
      ? { and: [{ slug: { equals: slug } }, { tenant: { equals: tenant } }] }
      : { slug: { equals: slug } }
    : {};

  const result = await payload.find({
    collection: 'pages',
    limit: 1,
    where,
    overrideAccess: true,
    req,
  });

  return (result.docs?.[0] as unknown as Record<string, unknown>) || null;
};

const findTargetBlock = (
  layout: Array<Record<string, unknown>>,
  selector: { blockId?: string; blockType?: string; blockIndex?: number },
) => {
  const { blockId, blockType, blockIndex = 0 } = selector;

  if (blockId) {
    const idx = layout.findIndex((block) => String(block?.id ?? '') === blockId);
    if (idx < 0) return { block: null, index: -1, occurrence: -1 };
    return { block: layout[idx], index: idx, occurrence: -1 };
  }

  if (!blockType) {
    return { block: null, index: -1, occurrence: -1 };
  }

  let seen = -1;
  for (let i = 0; i < layout.length; i += 1) {
    const block = layout[i];
    if (String(block?.blockType ?? '') !== blockType) continue;
    seen += 1;
    if (seen === blockIndex) {
      return { block, index: i, occurrence: seen };
    }
  }

  return { block: null, index: -1, occurrence: -1 };
};

const summarizeFieldValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return { kind: 'array', length: value.length };
  }
  if (value == null) {
    return { kind: 'null' };
  }
  if (typeof value === 'object') {
    return { kind: 'object', keys: Object.keys(value as Record<string, unknown>).slice(0, 20) };
  }
  if (typeof value === 'string') {
    return { kind: 'string', value: value.length > 140 ? `${value.slice(0, 137)}...` : value };
  }
  return { kind: typeof value, value };
};

const normalizeFieldSchema = (field: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {
    name: field.name ?? null,
    label: field.label ?? null,
    type: field.type ?? null,
    required: Boolean(field.required),
  };

  if (typeof field.defaultValue !== 'undefined') normalized.defaultValue = field.defaultValue;
  if (typeof field.localized === 'boolean') normalized.localized = field.localized;

  if (field.type === 'select' && Array.isArray(field.options)) {
    normalized.options = field.options.map((option) => {
      if (typeof option === 'string') return { label: option, value: option };
      if (option && typeof option === 'object') {
        const rec = option as Record<string, unknown>;
        return { label: rec.label ?? null, value: rec.value ?? null };
      }
      return { label: null, value: null };
    });
  }

  if (Array.isArray(field.fields)) {
    normalized.fields = (field.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema);
  }

  if (field.type === 'tabs' && Array.isArray(field.tabs)) {
    normalized.tabs = (field.tabs as Array<Record<string, unknown>>).map((tab) => ({
      name: tab.name ?? null,
      label: tab.label ?? null,
      fields: Array.isArray(tab.fields)
        ? (tab.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema)
        : [],
    }));
  }

  if (field.type === 'blocks' && Array.isArray(field.blocks)) {
    normalized.blocks = (field.blocks as Array<Record<string, unknown>>).map((block) => ({
      slug: block.slug ?? null,
      labels: block.labels ?? null,
      fields: Array.isArray(block.fields)
        ? (block.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema)
        : [],
    }));
  }

  return normalized;
};

const getPageBlockDefinitions = () => {
  const pageFields = Pages.fields as Array<unknown>;
  const tabsField = pageFields.find((field) => {
    if (!field || typeof field !== 'object') return false;
    const rec = field as Record<string, unknown>;
    return rec.type === 'tabs' && Array.isArray(rec.tabs);
  }) as Record<string, unknown> | undefined;

  if (!tabsField || !Array.isArray(tabsField.tabs)) return [];

  for (const tab of tabsField.tabs as Array<Record<string, unknown>>) {
    if (!Array.isArray(tab.fields)) continue;
    for (const field of tab.fields as Array<Record<string, unknown>>) {
      if (field?.name === 'layout' && field.type === 'blocks' && Array.isArray(field.blocks)) {
        return field.blocks as Array<Record<string, unknown>>;
      }
    }
  }

  return [];
};

const refreshIContactCacheTool = {
  name: 'refreshIContactCache',
  description: 'Refresh local iContact folder/list cache collections from the live iContact account.',
  parameters: {
    accountId: z.string().optional().describe('Optional iContact account ID override.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    try {
      const result = await refreshIContactCache({
        payload: req.payload,
        req,
        accountIdOverride: typeof args.accountId === 'string' ? args.accountId : undefined,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Error refreshing iContact cache: ${message}` }],
      };
    }
  },
};

const listIContactFoldersTool = {
  name: 'listIContactFolders',
  description: 'List iContact client folders for the configured account.',
  parameters: {
    accountId: z.string().optional().describe('Optional iContact account ID override.'),
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const cfg = getIContactConfigFromEnv();
      if (!cfg) {
        return {
          content: [{ type: 'text' as const, text: 'Error: iContact credentials are not configured.' }],
        };
      }
      const accountId = await resolveIContactAccountId(cfg, typeof args.accountId === 'string' ? args.accountId : undefined);
      const folders = await listIContactClientFolders(cfg, accountId);
      const normalized = (folders.clientfolders || []).map((folder: unknown) => {
        const folderRecord = folder && typeof folder === 'object' ? (folder as Record<string, unknown>) : {};
        return {
          clientFolderId: String(folderRecord.clientFolderId || ''),
          name: String(folderRecord.name || ''),
        };
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                accountId,
                total: folders.total,
                folders: normalized,
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
        content: [{ type: 'text' as const, text: `Error listing iContact folders: ${message}` }],
      };
    }
  },
};

const listIContactListsTool = {
  name: 'listIContactLists',
  description: 'List iContact lists for a specific client folder.',
  parameters: {
    clientFolderId: z.string().min(1).describe('Required iContact client folder ID.'),
    accountId: z.string().optional().describe('Optional iContact account ID override.'),
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const clientFolderId = typeof args.clientFolderId === 'string' ? args.clientFolderId.trim() : '';
      if (!clientFolderId) {
        return {
          content: [{ type: 'text' as const, text: 'Error: `clientFolderId` is required.' }],
        };
      }
      const cfg = getIContactConfigFromEnv();
      if (!cfg) {
        return {
          content: [{ type: 'text' as const, text: 'Error: iContact credentials are not configured.' }],
        };
      }
      const accountId = await resolveIContactAccountId(cfg, typeof args.accountId === 'string' ? args.accountId : undefined);
      const lists = await listIContactLists(cfg, accountId, clientFolderId);
      const normalized = (lists.lists || []).map((list: unknown) => {
        const listRecord = list && typeof list === 'object' ? (list as Record<string, unknown>) : {};
        return {
          listId: String(listRecord.listId || ''),
          name: String(listRecord.name || ''),
          description: typeof listRecord.description === 'string' ? listRecord.description : '',
        };
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                accountId,
                clientFolderId,
                total: lists.total,
                lists: normalized,
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
        content: [{ type: 'text' as const, text: `Error listing iContact lists: ${message}` }],
      };
    }
  },
};

const bulkConfigureIContactFormsTool = {
  name: 'bulkConfigureIContactForms',
  description:
    'Bulk assign iContact sync settings to forms by title and optional tenant filters, including folder/list IDs and field mapping.',
  parameters: {
    formTitle: z.string().min(1).describe('Exact form title to match.'),
    clientFolderId: z.string().min(1).describe('iContact client folder ID to set on matching forms.'),
    listIds: z.array(z.string().min(1)).min(1).describe('One or more iContact list IDs for matching forms.'),
    enableIContactSync: z.boolean().optional().default(true).describe('Enable or disable iContact sync.'),
    tenantIds: z.array(z.union([z.string(), z.number()])).optional().describe('Optional tenant IDs to limit matches.'),
    tenantSlugs: z.array(z.string()).optional().describe('Optional tenant slugs to limit matches.'),
    fieldMap: z
      .object({
        emailFieldName: z.string().optional(),
        firstNameFieldName: z.string().optional(),
        lastNameFieldName: z.string().optional(),
        mobileFieldName: z.string().optional(),
        zipFieldName: z.string().optional(),
      })
      .optional()
      .describe('Optional custom field mapping keys.'),
    dryRun: z.boolean().optional().default(false).describe('When true, report changes without writing.'),
    maxMatches: z.number().int().min(1).max(5000).optional().default(500).describe('Maximum forms to process.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const formTitle = typeof args.formTitle === 'string' ? args.formTitle.trim() : '';
    const clientFolderId = typeof args.clientFolderId === 'string' ? args.clientFolderId.trim() : '';
    const listIds = Array.isArray(args.listIds)
      ? args.listIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
      : [];
    const enableIContactSync = typeof args.enableIContactSync === 'boolean' ? args.enableIContactSync : true;
    const dryRun = typeof args.dryRun === 'boolean' ? args.dryRun : false;
    const maxMatches =
      typeof args.maxMatches === 'number' && Number.isFinite(args.maxMatches)
        ? Math.max(1, Math.min(5000, Math.trunc(args.maxMatches)))
        : 500;

    if (!formTitle || !clientFolderId || !listIds.length) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: `formTitle`, `clientFolderId`, and at least one `listIds` value are required.',
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

    const fieldMapInput = args.fieldMap && typeof args.fieldMap === 'object' ? (args.fieldMap as Record<string, unknown>) : {};
    const fieldMap = {
      emailFieldName: typeof fieldMapInput.emailFieldName === 'string' ? fieldMapInput.emailFieldName : 'email',
      firstNameFieldName: typeof fieldMapInput.firstNameFieldName === 'string' ? fieldMapInput.firstNameFieldName : 'firstname',
      lastNameFieldName: typeof fieldMapInput.lastNameFieldName === 'string' ? fieldMapInput.lastNameFieldName : 'lastname',
      mobileFieldName: typeof fieldMapInput.mobileFieldName === 'string' ? fieldMapInput.mobileFieldName : 'mobile',
      zipFieldName: typeof fieldMapInput.zipFieldName === 'string' ? fieldMapInput.zipFieldName : 'zip',
    };

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
          if (tenantDoc.id) tenantIds.add(String(tenantDoc.id));
          if (typeof tenantDoc.slug === 'string') foundSlugSet.add(tenantDoc.slug);
        }
        for (const slug of rawTenantSlugs) {
          if (!foundSlugSet.has(slug)) missingTenantSlugs.push(slug);
        }
      }

      const whereFilters: Array<Record<string, unknown>> = [{ title: { equals: formTitle } }];
      if (tenantIds.size > 0) {
        whereFilters.push({ tenant: { in: Array.from(tenantIds) } });
      }
      const where: Where =
        whereFilters.length > 1
          ? ({ and: whereFilters } as Where)
          : ((whereFilters[0] ?? {}) as Where);

      const folderLookup = await payload.find({
        collection: 'icontact-folders',
        where: { clientFolderId: { equals: clientFolderId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      });
      const folderDocId = folderLookup.docs?.[0]?.id ? String(folderLookup.docs[0].id) : '';
      if (!folderDocId) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: iContact folder ${clientFolderId} is not in cache. Refresh iContact cache first.`,
            },
          ],
        };
      }

      const listLookup = await payload.find({
        collection: 'icontact-lists',
        where: {
          and: [{ clientFolderId: { equals: clientFolderId } }, { listId: { in: listIds } }],
        },
        limit: Math.max(listIds.length * 2, 100),
        depth: 0,
        overrideAccess: true,
        req,
      });
      const listByListId = new Map<string, string>();
      for (const row of listLookup.docs as unknown[]) {
        const rowRecord = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        const listId = typeof rowRecord.listId === 'string' ? rowRecord.listId : '';
        const docId = rowRecord.id ? String(rowRecord.id) : '';
        if (listId && docId) listByListId.set(listId, docId);
      }
      const missingListIds = listIds.filter((listId) => !listByListId.has(listId));
      if (missingListIds.length > 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: list IDs missing from cache for folder ${clientFolderId}: ${missingListIds.join(', ')}`,
            },
          ],
        };
      }
      const listDocIds = listIds.map((listId) => listByListId.get(listId)!).filter(Boolean);

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
        if (page === 1) totalFound = result.totalDocs;
        if (result.docs.length === 0) break;

        for (const formDoc of result.docs as unknown as Array<Record<string, unknown>>) {
          if (processed >= maxMatches) {
            done = true;
            break;
          }
          processed += 1;

          const { tenantId, tenantName, tenantSlug } = getTenantMeta(formDoc.tenant);
          const formId = formDoc.id ? String(formDoc.id) : '';
          const patch = {
            enableIContactSync,
            iContactFolder: folderDocId,
            iContactLists: listDocIds,
            iContactFieldMap: fieldMap,
          };
          const currentMatchesPatch = Object.entries(patch).every(([field, newValue]) => deepEqual(formDoc[field], newValue));
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
              id: formId,
              data: patch,
              overrideAccess: true,
              req,
            });
            changed.push({ ...baseRow, dryRun: false });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            failed.push({ ...baseRow, error: message });
          }
        }
        if (done || page >= result.totalPages) break;
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
        content: [{ type: 'text' as const, text: `Error bulk configuring iContact forms: ${message}` }],
      };
    }
  },
};

const backfillIContactUnsyncedTool = {
  name: 'backfillIContactUnsynced',
  description:
    'Sync unsynced form submissions to iContact for forms matching a title, optionally filtered to specific tenants.',
  parameters: {
    formTitle: z.string().min(1).describe('Exact form title to match.'),
    tenantIds: z.array(z.union([z.string(), z.number()])).optional().describe('Optional tenant IDs to limit forms.'),
    tenantSlugs: z.array(z.string()).optional().describe('Optional tenant slugs to limit forms.'),
    dryRun: z.boolean().optional().default(false).describe('When true, do not write updates.'),
    maxForms: z.number().int().min(1).max(5000).optional().default(500).describe('Maximum forms to process.'),
    maxSubmissionsPerForm: z.number().int().min(1).max(5000).optional().default(500).describe('Max submissions per form to scan.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const formTitle = typeof args.formTitle === 'string' ? args.formTitle.trim() : '';
    const dryRun = typeof args.dryRun === 'boolean' ? args.dryRun : false;
    const maxForms =
      typeof args.maxForms === 'number' && Number.isFinite(args.maxForms)
        ? Math.max(1, Math.min(5000, Math.trunc(args.maxForms)))
        : 500;
    const maxSubmissionsPerForm =
      typeof args.maxSubmissionsPerForm === 'number' && Number.isFinite(args.maxSubmissionsPerForm)
        ? Math.max(1, Math.min(5000, Math.trunc(args.maxSubmissionsPerForm)))
        : 500;

    if (!formTitle) {
      return {
        content: [{ type: 'text' as const, text: 'Error: `formTitle` is required.' }],
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
          where: { slug: { in: rawTenantSlugs } },
        });
        const foundSlugSet = new Set<string>();
        for (const tenantDoc of tenants.docs as unknown as Array<Record<string, unknown>>) {
          if (tenantDoc.id) tenantIds.add(String(tenantDoc.id));
          if (typeof tenantDoc.slug === 'string') foundSlugSet.add(tenantDoc.slug);
        }
        for (const slug of rawTenantSlugs) {
          if (!foundSlugSet.has(slug)) missingTenantSlugs.push(slug);
        }
      }

      const whereFilters: Array<Record<string, unknown>> = [{ title: { equals: formTitle } }];
      if (tenantIds.size > 0) whereFilters.push({ tenant: { in: Array.from(tenantIds) } });
      const where: Where =
        whereFilters.length > 1
          ? ({ and: whereFilters } as Where)
          : ((whereFilters[0] ?? {}) as Where);

      const formLookup = await payload.find({
        collection: 'forms',
        depth: 0,
        where,
        limit: maxForms,
        overrideAccess: true,
        req,
      });

      const formResults: Array<Record<string, unknown>> = [];

      for (const formDoc of formLookup.docs as unknown[]) {
        const formDocRecord = formDoc && typeof formDoc === 'object' ? (formDoc as Record<string, unknown>) : {};
        const formId = String(formDocRecord.id || '');
        if (!formId) continue;

        let page = 1;
        const submissions: unknown[] = [];
        let done = false;
        while (!done) {
          const subResult = await payload.find({
            collection: 'form-submissions',
            where: { form: { equals: formId } },
            limit: 100,
            page,
            depth: 0,
            overrideAccess: true,
            req,
          });
          for (const row of subResult.docs || []) {
            submissions.push(row);
            if (submissions.length >= maxSubmissionsPerForm) {
              done = true;
              break;
            }
          }
          if (done || !subResult.hasNextPage) break;
          page += 1;
        }

        const candidates = submissions.filter(
          (submission) => String((submission as Record<string, unknown> | undefined)?.iContactSyncStatus || '') !== 'success',
        );
        const changed: Array<Record<string, unknown>> = [];
        const failed: Array<Record<string, unknown>> = [];

        for (const submission of candidates) {
          const submissionRecord = submission as Record<string, unknown> | undefined;
          const submissionId = String(submissionRecord?.id || '');
          if (!submissionId) continue;

          if (dryRun) {
            changed.push({ submissionId, status: 'would-sync' });
            continue;
          }

          const syncResult = await syncSubmissionToIContact({
            formDoc,
            submissionData: submissionRecord?.submissionData,
            payload: req.payload,
            req,
          });

          try {
            await payload.update({
              collection: 'form-submissions',
              id: submissionId,
              data: {
                iContactSyncStatus: syncResult.status,
                iContactSyncError: syncResult.error || syncResult.reason || undefined,
                iContactAccountId: syncResult.accountId || undefined,
                iContactClientFolderId: syncResult.clientFolderId || undefined,
                iContactListIds: (syncResult.listIds || []).map((listId) => ({ listId })),
                iContactContactId: syncResult.contactId || undefined,
                iContactSyncedAt: syncResult.status === 'success' ? new Date().toISOString() : undefined,
              },
              overrideAccess: true,
              req,
              context: { skipIContactSyncHook: true },
            });
            changed.push({ submissionId, status: syncResult.status, error: syncResult.error || syncResult.reason || null });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            failed.push({ submissionId, error: message });
          }
        }

        formResults.push({
          formId,
          title: typeof formDocRecord.title === 'string' ? formDocRecord.title : null,
          scanned: submissions.length,
          candidates: candidates.length,
          changedCount: changed.length,
          failedCount: failed.length,
          changed,
          failed,
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                formTitle,
                dryRun,
                formsMatched: formLookup.docs.length,
                missingTenantSlugs,
                results: formResults,
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
        content: [{ type: 'text' as const, text: `Error backfilling iContact submissions: ${message}` }],
      };
    }
  },
};

const listPageBlocksTool = {
  name: 'listPageBlocks',
  description:
    'List blocks on a page with ids, types, indices, and compact field summaries. If pageId is omitted, provide slug and tenant.',
  parameters: {
    pageId: z.union([z.string(), z.number()]).optional().describe('Optional page ID.'),
    slug: z.string().optional().describe('Page slug (used when pageId is not provided).'),
    tenant: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Tenant ID (recommended when using slug). For best results, always include tenant.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const pageId = args.pageId != null ? String(args.pageId) : undefined;
    const slug = typeof args.slug === 'string' ? args.slug.trim() : undefined;
    const tenant = args.tenant != null ? String(args.tenant) : undefined;

    try {
      const pageDoc = await loadPageDocument(payload, req, { pageId, slug, tenant });
      if (!pageDoc || !pageDoc.id) {
        return { content: [{ type: 'text' as const, text: 'Error: page not found.' }] };
      }

      const layout = Array.isArray(pageDoc.layout)
        ? (pageDoc.layout as Array<Record<string, unknown>>)
        : [];

      const blocks = layout.map((block, index) => {
        const blockType = typeof block.blockType === 'string' ? block.blockType : null;
        const keys = Object.keys(block).filter((key) => !['id', 'blockType'].includes(key));
        const summary: Record<string, unknown> = {};
        for (const key of keys.slice(0, 20)) {
          summary[key] = summarizeFieldValue(block[key]);
        }
        return {
          id: block.id ? String(block.id) : null,
          blockType,
          index,
          summary,
        };
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                pageId: String(pageDoc.id),
                slug: pageDoc.slug ?? null,
                status: pageDoc._status ?? null,
                blockCount: blocks.length,
                blocks,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text' as const, text: `Error listing page blocks: ${message}` }] };
    }
  },
};

const getBlockShapeTool = {
  name: 'getBlockShape',
  description: 'Return editable field schema for one block type or all page block types.',
  parameters: {
    blockType: z.string().optional().describe('Optional block type slug, e.g. "policyVoices".'),
  },
  handler: async (args: Record<string, unknown>) => {
    const blockType = typeof args.blockType === 'string' ? args.blockType.trim() : '';

    try {
      const definitions = getPageBlockDefinitions();
      if (definitions.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: could not resolve page block definitions.' }],
        };
      }

      const selected = blockType
        ? definitions.filter((block) => String(block.slug ?? '') === blockType)
        : definitions;

      if (selected.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `Error: blockType "${blockType}" not found.` }],
        };
      }

      const blocks = selected.map((block) => ({
        slug: block.slug ?? null,
        labels: block.labels ?? null,
        fields: Array.isArray(block.fields)
          ? (block.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema)
          : [],
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                blockCount: blocks.length,
                blocks,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text' as const, text: `Error getting block shape: ${message}` }] };
    }
  },
};

const updateBlockFieldsTool = {
  name: 'updateBlockFields',
  description:
    'Update any page block fields using path operations. Supports nested arrays/objects with dot and [index] syntax. Default behavior writes to draft.',
  parameters: {
    pageId: z.union([z.string(), z.number()]).optional().describe('Optional page ID.'),
    slug: z.string().optional().describe('Page slug (used when pageId is not provided).'),
    tenant: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Tenant ID (recommended when using slug). If slug is ambiguous, tenant is required.'),
    blockId: z.union([z.string(), z.number()]).optional().describe('Optional block ID.'),
    blockType: z.string().optional().describe('Optional block type slug.'),
    blockIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe('Occurrence index among blocks of the same blockType.'),
    updates: z
      .array(
        z.object({
          op: z.enum(['set', 'unset', 'remove']).optional().default('set'),
          path: z.string().min(1).describe('Path relative to the block object, e.g. "speechBubbles[0].text".'),
          value: z.unknown().optional().describe('Required for `set`.'),
        }),
      )
      .min(1),
    createMissing: z
      .boolean()
      .optional()
      .default(true)
      .describe('When true, creates missing objects/arrays while applying `set`.'),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe('When true, reports resulting block without writing.'),
    draft: z
      .boolean()
      .optional()
      .default(true)
      .describe('When true, writes to draft instead of directly updating published content. Defaults to true.'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const pageId = args.pageId != null ? String(args.pageId) : undefined;
    const slug = typeof args.slug === 'string' ? args.slug.trim() : undefined;
    const tenant = args.tenant != null ? String(args.tenant) : undefined;
    const blockId = args.blockId != null ? String(args.blockId) : undefined;
    const blockType = typeof args.blockType === 'string' ? args.blockType.trim() : undefined;
    const blockIndex = typeof args.blockIndex === 'number' ? Math.max(0, Math.trunc(args.blockIndex)) : 0;
    const updates = Array.isArray(args.updates) ? args.updates : [];
    const createMissing = typeof args.createMissing === 'boolean' ? args.createMissing : true;
    const dryRun = typeof args.dryRun === 'boolean' ? args.dryRun : false;
    const draft = typeof args.draft === 'boolean' ? args.draft : true;

    if (!pageId && !slug) {
      return { content: [{ type: 'text' as const, text: 'Error: provide `pageId` or `slug`.' }] };
    }
    if (!blockId && !blockType) {
      return {
        content: [{ type: 'text' as const, text: 'Error: provide `blockId` or (`blockType` + optional `blockIndex`).' }],
      };
    }

    try {
      const pageDoc = await loadPageDocument(payload, req, { pageId, slug, tenant });
      if (!pageDoc || !pageDoc.id) {
        return { content: [{ type: 'text' as const, text: 'Error: page not found.' }] };
      }

      const layout = Array.isArray(pageDoc.layout)
        ? [...(pageDoc.layout as Array<Record<string, unknown>>)]
        : [];

      const target = findTargetBlock(layout, { blockId, blockType, blockIndex });
      if (!target.block || target.index < 0) {
        return { content: [{ type: 'text' as const, text: 'Error: target block not found.' }] };
      }

      const nextBlock = cloneValue(target.block as Record<string, unknown>);
      const applied: Array<Record<string, unknown>> = [];
      const failed: Array<Record<string, unknown>> = [];

      for (const rawUpdate of updates) {
        const update = (rawUpdate ?? {}) as Record<string, unknown>;
        const op = update.op === 'unset' || update.op === 'remove' ? update.op : 'set';
        const path = typeof update.path === 'string' ? update.path.trim() : '';
        if (!path) {
          failed.push({ ...update, error: 'Missing update path.' });
          continue;
        }

        try {
          const segments = parsePathSegments(path);
          const first = segments[0];
          if (first === 'id' || first === 'blockType') {
            throw new Error(`Path "${path}" is immutable.`);
          }

          if (op === 'set') {
            if (!Object.prototype.hasOwnProperty.call(update, 'value')) {
              throw new Error(`Set operation for "${path}" requires a value.`);
            }
            setAtPath(nextBlock, segments, update.value, createMissing);
          } else if (op === 'unset') {
            unsetAtPath(nextBlock, segments);
          } else {
            removeAtPath(nextBlock, segments);
          }

          applied.push({ op, path });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          failed.push({ op, path, error: message });
        }
      }

      const changed = !deepEqual(target.block, nextBlock);
      const summary = {
        pageId: String(pageDoc.id),
        slug: pageDoc.slug ?? null,
        blockId: nextBlock.id ? String(nextBlock.id) : null,
        blockType: nextBlock.blockType ?? null,
        blockArrayIndex: target.index,
        changed,
        dryRun,
        appliedCount: applied.length,
        failedCount: failed.length,
        applied,
        failed,
      };

      if (dryRun || !changed) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ...summary,
                  resultingBlock: nextBlock,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      layout[target.index] = nextBlock;
      const updated = (await payload.update({
        collection: 'pages',
        id: String(pageDoc.id),
        data: { layout },
        draft,
        overrideAccess: true,
        req,
      })) as unknown as Record<string, unknown>;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ...summary,
                action: 'updated',
                status: updated?._status ?? pageDoc._status ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text' as const, text: `Error updating block fields: ${message}` }] };
    }
  },
};

const listRichTextNodesTool = {
  name: 'listRichTextNodes',
  description:
    'List Lexical rich-text nodes from a document path with node keys, types, and parent relationships.',
  parameters: {
    collection: z.enum(['pages', 'posts']).describe('Collection containing the richText field.'),
    docId: z.union([z.string(), z.number()]).optional().describe('Optional document ID.'),
    slug: z.string().optional().describe('Document slug (used when docId is not provided).'),
    tenant: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Tenant ID (recommended when using slug).'),
    richTextPath: z
      .string()
      .min(1)
      .describe('Path to the richText JSON, e.g. "content" or "layout[0].columns[0].richText".'),
    maxNodes: z.number().int().min(1).max(5000).optional().default(500),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const collection = args.collection === 'posts' ? 'posts' : 'pages';
    const docId = args.docId != null ? String(args.docId) : undefined;
    const slug = typeof args.slug === 'string' ? args.slug.trim() : undefined;
    const tenant = args.tenant != null ? String(args.tenant) : undefined;
    const richTextPath = typeof args.richTextPath === 'string' ? args.richTextPath.trim() : '';
    const maxNodes =
      typeof args.maxNodes === 'number' && Number.isFinite(args.maxNodes)
        ? Math.max(1, Math.min(5000, Math.trunc(args.maxNodes)))
        : 500;

    if (!richTextPath) {
      return { content: [{ type: 'text' as const, text: 'Error: `richTextPath` is required.' }] };
    }

    try {
      const doc = await loadCollectionDocument(payload, req, { collection, docId, slug, tenant });
      if (!doc || !doc.id) {
        return { content: [{ type: 'text' as const, text: 'Error: document not found.' }] };
      }

      const richTextValue = getAtPath(doc as Record<string, unknown>, parsePathSegments(richTextPath));
      if (!isLexicalDoc(richTextValue)) {
        return {
          content: [{ type: 'text' as const, text: `Error: path "${richTextPath}" is not a Lexical richText value.` }],
        };
      }

      const nodes: Array<Record<string, unknown>> = [];
      const root = (richTextValue.root as Record<string, unknown>) as LexicalNodeLike;
      const rootChildren = Array.isArray(root.children) ? (root.children as LexicalNodeLike[]) : [];

      type WalkFrame = {
        node: LexicalNodeLike;
        parentKey: string | null;
        path: string;
        index: number;
      };
      const stack: WalkFrame[] = rootChildren.map((node, index) => ({
        node,
        parentKey: null,
        path: `root.children[${index}]`,
        index,
      }));

      while (stack.length > 0 && nodes.length < maxNodes) {
        const current = stack.shift()!;
        const key = getLexicalNodeKey(current.node);
        const type = typeof current.node.type === 'string' ? current.node.type : null;
        const text = typeof current.node.text === 'string' ? current.node.text : null;

        nodes.push({
          key: key || null,
          type,
          textPreview: text ? (text.length > 140 ? `${text.slice(0, 137)}...` : text) : null,
          parentKey: current.parentKey,
          index: current.index,
          path: current.path,
          childCount: Array.isArray(current.node.children) ? current.node.children.length : 0,
        });

        if (Array.isArray(current.node.children)) {
          const parentKeyForChildren = key || current.parentKey;
          current.node.children.forEach((child, childIndex) => {
            stack.push({
              node: child,
              parentKey: parentKeyForChildren ?? null,
              index: childIndex,
              path: `${current.path}.children[${childIndex}]`,
            });
          });
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                collection,
                docId: String(doc.id),
                slug: doc.slug ?? null,
                richTextPath,
                nodeCount: nodes.length,
                nodes,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text' as const, text: `Error listing rich text nodes: ${message}` }] };
    }
  },
};

const updateRichTextNodesTool = {
  name: 'updateRichTextNodes',
  description:
    'Tree-aware Lexical updates by node key/type/text matching. Supports setProps, replaceText, removeNode, and insertChild.',
  parameters: {
    collection: z.enum(['pages', 'posts']).describe('Collection containing the richText field.'),
    docId: z.union([z.string(), z.number()]).optional().describe('Optional document ID.'),
    slug: z.string().optional().describe('Document slug (used when docId is not provided).'),
    tenant: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Tenant ID (recommended when using slug).'),
    richTextPath: z
      .string()
      .min(1)
      .describe('Path to the richText JSON, e.g. "content" or "layout[0].columns[0].richText".'),
    operations: z
      .array(
        z.object({
          op: z.enum(['setProps', 'replaceText', 'removeNode', 'insertChild']),
          where: z
            .object({
              key: z.string().optional(),
              type: z.string().optional(),
              textIncludes: z.string().optional(),
            })
            .optional(),
          props: z.record(z.unknown()).optional().describe('For setProps.'),
          text: z.string().optional().describe('For replaceText.'),
          node: z.record(z.unknown()).optional().describe('For insertChild.'),
          index: z.number().int().min(0).optional().describe('For insertChild; default appends.'),
        }),
      )
      .min(1),
    dryRun: z.boolean().optional().default(false),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const collection = args.collection === 'posts' ? 'posts' : 'pages';
    const docId = args.docId != null ? String(args.docId) : undefined;
    const slug = typeof args.slug === 'string' ? args.slug.trim() : undefined;
    const tenant = args.tenant != null ? String(args.tenant) : undefined;
    const richTextPath = typeof args.richTextPath === 'string' ? args.richTextPath.trim() : '';
    const operations = Array.isArray(args.operations) ? args.operations : [];
    const dryRun = typeof args.dryRun === 'boolean' ? args.dryRun : false;

    if (!richTextPath) {
      return { content: [{ type: 'text' as const, text: 'Error: `richTextPath` is required.' }] };
    }

    try {
      const doc = await loadCollectionDocument(payload, req, { collection, docId, slug, tenant });
      if (!doc || !doc.id) {
        return { content: [{ type: 'text' as const, text: 'Error: document not found.' }] };
      }

      const docClone = cloneValue(doc as Record<string, unknown>);
      const richTextSegments = parsePathSegments(richTextPath);
      const richTextValue = getAtPath(docClone as Record<string, unknown>, richTextSegments);

      if (!isLexicalDoc(richTextValue)) {
        return {
          content: [{ type: 'text' as const, text: `Error: path "${richTextPath}" is not a Lexical richText value.` }],
        };
      }

      const root = (richTextValue.root as Record<string, unknown>) as LexicalNodeLike;
      if (!Array.isArray(root.children)) {
        root.children = [];
      }

      type NodeRef = {
        node: LexicalNodeLike;
        parent: LexicalNodeLike | null;
        indexInParent: number;
      };

      const collectNodeRefs = (): NodeRef[] => {
        const refs: NodeRef[] = [];
        const walk = (parent: LexicalNodeLike | null, nodes: LexicalNodeLike[]) => {
          nodes.forEach((node, index) => {
            refs.push({ node, parent, indexInParent: index });
            if (Array.isArray(node.children)) {
              walk(node, node.children);
            }
          });
        };
        walk(root, root.children as LexicalNodeLike[]);
        return refs;
      };

      const matchesWhere = (node: LexicalNodeLike, where: Record<string, unknown> | undefined) => {
        if (!where || Object.keys(where).length === 0) return false;
        const key = getLexicalNodeKey(node);
        if (typeof where.key === 'string' && where.key.trim().length > 0 && key !== where.key.trim()) return false;
        if (typeof where.type === 'string' && where.type.trim().length > 0) {
          if (String(node.type ?? '') !== where.type.trim()) return false;
        }
        if (typeof where.textIncludes === 'string' && where.textIncludes.length > 0) {
          const text = typeof node.text === 'string' ? node.text : '';
          if (!text.includes(where.textIncludes)) return false;
        }
        return true;
      };

      const applied: Array<Record<string, unknown>> = [];
      const failed: Array<Record<string, unknown>> = [];

      for (const rawOperation of operations) {
        const operation = (rawOperation ?? {}) as Record<string, unknown>;
        const op = operation.op;
        const where = operation.where && typeof operation.where === 'object'
          ? (operation.where as Record<string, unknown>)
          : undefined;

        if (op !== 'insertChild' && (!where || Object.keys(where).length === 0)) {
          failed.push({ op, error: '`where` is required for non-insert operations.' });
          continue;
        }

        try {
          if (op === 'setProps') {
            if (!operation.props || typeof operation.props !== 'object' || Array.isArray(operation.props)) {
              throw new Error('setProps requires `props` object.');
            }
            const targets = collectNodeRefs().filter((ref) => matchesWhere(ref.node, where));
            targets.forEach((ref) => Object.assign(ref.node, operation.props as Record<string, unknown>));
            applied.push({ op, matched: targets.length });
            continue;
          }

          if (op === 'replaceText') {
            if (typeof operation.text !== 'string') {
              throw new Error('replaceText requires `text`.');
            }
            const targets = collectNodeRefs().filter((ref) => matchesWhere(ref.node, where));
            targets.forEach((ref) => {
              ref.node.text = operation.text as string;
            });
            applied.push({ op, matched: targets.length });
            continue;
          }

          if (op === 'removeNode') {
            const targets = collectNodeRefs()
              .filter((ref) => matchesWhere(ref.node, where))
              .sort((a, b) => b.indexInParent - a.indexInParent);

            let removed = 0;
            targets.forEach((ref) => {
              if (!ref.parent || !Array.isArray(ref.parent.children)) return;
              if (ref.indexInParent < 0 || ref.indexInParent >= ref.parent.children.length) return;
              ref.parent.children.splice(ref.indexInParent, 1);
              removed += 1;
            });
            applied.push({ op, matched: targets.length, removed });
            continue;
          }

          if (op === 'insertChild') {
            if (!operation.node || typeof operation.node !== 'object' || Array.isArray(operation.node)) {
              throw new Error('insertChild requires `node` object.');
            }

            const targetParents = where && Object.keys(where).length > 0
              ? collectNodeRefs().filter((ref) => matchesWhere(ref.node, where))
              : [{ node: root } as NodeRef];

            let inserted = 0;
            targetParents.forEach((ref) => {
              if (!Array.isArray(ref.node.children)) {
                ref.node.children = [];
              }
              const children = ref.node.children as LexicalNodeLike[];
              const nextNode = cloneValue(operation.node as Record<string, unknown>) as LexicalNodeLike;
              const at = typeof operation.index === 'number'
                ? Math.max(0, Math.min(children.length, Math.trunc(operation.index)))
                : children.length;
              children.splice(at, 0, nextNode);
              inserted += 1;
            });
            applied.push({ op, matched: targetParents.length, inserted });
            continue;
          }

          throw new Error(`Unsupported op "${String(op)}".`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          failed.push({ op, error: message });
        }
      }

      const changed = !deepEqual(getAtPath(doc as Record<string, unknown>, richTextSegments), richTextValue);

      if (dryRun || !changed) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  collection,
                  docId: String(doc.id),
                  slug: doc.slug ?? null,
                  richTextPath,
                  dryRun,
                  changed,
                  applied,
                  failed,
                  resultingRichText: richTextValue,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      setAtPath(docClone as Record<string, unknown>, richTextSegments, richTextValue, true);
      const isPublished = doc._status === 'published';
      const updated = (await payload.update({
        collection,
        id: String(doc.id),
        data: docClone,
        draft: !isPublished,
        overrideAccess: true,
        req,
      })) as unknown as Record<string, unknown>;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                action: 'updated',
                collection,
                docId: String(doc.id),
                slug: updated?.slug ?? doc.slug ?? null,
                richTextPath,
                applied,
                failed,
                status: updated?._status ?? doc._status ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text' as const, text: `Error updating rich text nodes: ${message}` }] };
    }
  },
};

const getEditingDefaultsTool = {
  name: 'getEditingDefaults',
  description:
    'Return preferred editing conventions for this CMS workspace (tenant targeting, slug interpretation, and draft-first publishing behavior).',
  parameters: {},
  handler: async () => {
    const guidance = [
      'Editing defaults for this workspace:',
      '1) Tenant targeting: If pageId is not provided, include both slug and tenant whenever possible.',
      '2) Slug shorthand preference: When a user provides a value like "/xyz" and the intent is tenant context, treat it as tenant slug xyz unless explicitly overridden.',
      '3) Draft-first behavior: Prefer draft writes by default. Only publish when the user explicitly requests publishing.',
      '4) Safe page-block workflow: listPageBlocks -> getBlockShape -> updateBlockFields.',
      '5) Scope minimization: Update only required fields/paths; avoid broad full-document rewrites unless explicitly requested.',
    ].join('\n');

    return {
      content: [{ type: 'text' as const, text: guidance }],
    };
  },
};

const upsertPageWithBlocksTool = {
  name: 'upsertPageWithBlocks',
  description:
    'Create or update a page with raw hero/layout JSON. Use this when createPages/updatePages fail on block layout validation. Prefer draft unless publish is explicitly requested.',
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
      .describe('Document status. Defaults to draft; use published only when explicitly requested.'),
    hero: z.record(z.unknown()).optional().describe('Raw hero object, e.g. {"type":"none"}.'),
    layout: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe('Raw block layout array.'),
    meta: z.record(z.unknown()).optional().describe('Optional SEO meta object.'),
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
          const draftMode = status !== 'published';
          result = (await payload.update({
            collection: 'pages',
            id: targetId,
            data,
            ...(draftMode ? { draft: true as const } : {}),
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
            draft: true,
            overrideAccess: true,
            req,
          })) as unknown as Record<string, unknown>;
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

const updatePolicyVoicesSpeechBubblesTool = {
  name: 'updatePolicyVoicesSpeechBubbles',
  description:
    'Update only speech bubbles (and their custom #anchor links) for a policyVoices block on a page.',
  parameters: {
    pageId: z.union([z.string(), z.number()]).optional().describe('Optional page ID.'),
    slug: z.string().optional().describe('Page slug (used when pageId is not provided).'),
    tenant: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Tenant ID (recommended when using slug).'),
    blockId: z.union([z.string(), z.number()]).optional().describe('Optional policyVoices block ID.'),
    bubbles: z
      .array(
        z.object({
          id: z.union([z.string(), z.number()]).optional(),
          text: z.string().optional(),
          side: z.enum(['affordability', 'accountability']).optional(),
          anchorId: z.string().min(1),
          useAutoPosition: z.boolean().optional(),
          floatDelay: z.number().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        }),
      )
      .min(1)
      .describe('Speech bubbles mapped to cards using anchorId (stored as custom url "#<anchorId>").'),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const pageId = args.pageId != null ? String(args.pageId) : undefined;
    const slug = typeof args.slug === 'string' ? args.slug.trim() : undefined;
    const tenant = args.tenant != null ? String(args.tenant) : undefined;
    const blockId = args.blockId != null ? String(args.blockId) : undefined;
    const bubblesInput = Array.isArray(args.bubbles) ? args.bubbles : [];

    if (!pageId && !slug) {
      return {
        content: [
          { type: 'text' as const, text: 'Error: provide `pageId` or `slug`.' },
        ],
      };
    }

    try {
      let pageDoc: Record<string, unknown> | null = null;

      if (pageId) {
        pageDoc = (await payload.findByID({
          collection: 'pages',
          id: pageId,
          overrideAccess: true,
          req,
        })) as unknown as Record<string, unknown>;
      } else {
        const where: Where = slug
          ? tenant
            ? { and: [{ slug: { equals: slug } }, { tenant: { equals: tenant } }] }
            : { slug: { equals: slug } }
          : {};

        const result = await payload.find({
          collection: 'pages',
          limit: 1,
          where,
          overrideAccess: true,
          req,
        });
        pageDoc = (result.docs?.[0] as unknown as Record<string, unknown>) || null;
      }

      if (!pageDoc || !pageDoc.id) {
        return {
          content: [{ type: 'text' as const, text: 'Error: page not found.' }],
        };
      }

      const layout = Array.isArray(pageDoc.layout) ? [...(pageDoc.layout as Array<Record<string, unknown>>)] : [];
      const policyBlockIndex = layout.findIndex((block) => {
        if (!block || typeof block !== 'object') return false;
        if (blockId) return String(block.id ?? '') === blockId;
        return block.blockType === 'policyVoices';
      });

      if (policyBlockIndex < 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: policyVoices block not found.' }],
        };
      }

      const policyBlock = { ...(layout[policyBlockIndex] || {}) };
      const existingBubbles = Array.isArray(policyBlock.speechBubbles)
        ? (policyBlock.speechBubbles as Array<Record<string, unknown>>)
        : [];

      const nextBubbles = bubblesInput.map((bubble, index) => {
        const input = bubble as Record<string, unknown>;
        const existing = existingBubbles[index] || {};
        const anchorId = String(input.anchorId || '').trim();

        return {
          ...existing,
          ...(input.id != null ? { id: String(input.id) } : {}),
          ...(typeof input.text === 'string' ? { text: input.text } : {}),
          side: input.side === 'accountability' ? 'accountability' : 'affordability',
          ...(typeof input.useAutoPosition === 'boolean'
            ? { useAutoPosition: input.useAutoPosition }
            : {}),
          ...(typeof input.floatDelay === 'number' ? { floatDelay: input.floatDelay } : {}),
          ...(typeof input.x === 'number' ? { x: input.x } : {}),
          ...(typeof input.y === 'number' ? { y: input.y } : {}),
          link: {
            type: 'custom',
            url: `#${anchorId}`,
          },
        };
      });

      policyBlock.speechBubbles = nextBubbles;
      layout[policyBlockIndex] = policyBlock;

      const isPublished = pageDoc._status === 'published';
      const updated = (await payload.update({
        collection: 'pages',
        id: String(pageDoc.id),
        data: {
          layout,
        },
        draft: !isPublished,
        overrideAccess: true,
        req,
      })) as unknown as Record<string, unknown>;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                action: 'updated',
                pageId: updated?.id ?? pageDoc.id,
                slug: updated?.slug ?? pageDoc.slug ?? null,
                blockId: policyBlock.id ?? null,
                bubbleCount: nextBubbles.length,
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
        content: [{ type: 'text' as const, text: `Error updating speech bubbles: ${message}` }],
      };
    }
  },
};

const updatePolicyVoicesCardLinksTool = {
  name: 'updatePolicyVoicesCardLinks',
  description:
    'Update only card links for a policyVoices block using entry selectors (anchorId, entryId, or title).',
  parameters: {
    pageId: z.union([z.string(), z.number()]).optional().describe('Optional page ID.'),
    slug: z.string().optional().describe('Page slug (used when pageId is not provided).'),
    tenant: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Tenant ID (recommended when using slug).'),
    blockId: z.union([z.string(), z.number()]).optional().describe('Optional policyVoices block ID.'),
    links: z
      .array(
        z.object({
          side: z.enum(['affordability', 'accountability']).optional(),
          entryId: z.union([z.string(), z.number()]).optional(),
          anchorId: z.string().optional(),
          title: z.string().optional(),
          label: z.string().optional(),
          url: z.string().min(1),
          newTab: z.boolean().optional(),
        }),
      )
      .min(1)
      .describe(
        'Link updates. Each update must target an entry by entryId, anchorId, or title. side is recommended.',
      ),
  },
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const payload = req.payload;
    const pageId = args.pageId != null ? String(args.pageId) : undefined;
    const slug = typeof args.slug === 'string' ? args.slug.trim() : undefined;
    const tenant = args.tenant != null ? String(args.tenant) : undefined;
    const blockId = args.blockId != null ? String(args.blockId) : undefined;
    const linksInput = Array.isArray(args.links) ? args.links : [];

    if (!pageId && !slug) {
      return {
        content: [{ type: 'text' as const, text: 'Error: provide `pageId` or `slug`.' }],
      };
    }

    try {
      let pageDoc: Record<string, unknown> | null = null;

      if (pageId) {
        pageDoc = (await payload.findByID({
          collection: 'pages',
          id: pageId,
          overrideAccess: true,
          req,
        })) as unknown as Record<string, unknown>;
      } else {
        const where: Where = slug
          ? tenant
            ? { and: [{ slug: { equals: slug } }, { tenant: { equals: tenant } }] }
            : { slug: { equals: slug } }
          : {};

        const result = await payload.find({
          collection: 'pages',
          limit: 1,
          where,
          overrideAccess: true,
          req,
        });
        pageDoc = (result.docs?.[0] as unknown as Record<string, unknown>) || null;
      }

      if (!pageDoc || !pageDoc.id) {
        return {
          content: [{ type: 'text' as const, text: 'Error: page not found.' }],
        };
      }

      const layout = Array.isArray(pageDoc.layout) ? [...(pageDoc.layout as Array<Record<string, unknown>>)] : [];
      const policyBlockIndex = layout.findIndex((block) => {
        if (!block || typeof block !== 'object') return false;
        if (blockId) return String(block.id ?? '') === blockId;
        return block.blockType === 'policyVoices';
      });

      if (policyBlockIndex < 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: policyVoices block not found.' }],
        };
      }

      const policyBlock = { ...(layout[policyBlockIndex] || {}) };
      const affordabilityEntries = Array.isArray(policyBlock.affordabilityEntries)
        ? [...(policyBlock.affordabilityEntries as Array<Record<string, unknown>>)]
        : [];
      const accountabilityEntries = Array.isArray(policyBlock.accountabilityEntries)
        ? [...(policyBlock.accountabilityEntries as Array<Record<string, unknown>>)]
        : [];
      const legacyCards = Array.isArray(policyBlock.cards)
        ? [...(policyBlock.cards as Array<Record<string, unknown>>)]
        : [];

      const matchesEntry = (entry: Record<string, unknown>, update: Record<string, unknown>) => {
        const entryId = update.entryId != null ? String(update.entryId) : '';
        const anchorId = typeof update.anchorId === 'string' ? update.anchorId.trim() : '';
        const title = typeof update.title === 'string' ? update.title.trim().toLowerCase() : '';

        if (entryId) return String(entry.id ?? '') === entryId;
        if (anchorId) return String(entry.anchorId ?? '').trim() === anchorId;
        if (title) return String(entry.title ?? '').trim().toLowerCase() === title;
        return false;
      };

      let updatedCount = 0;
      const notFound: Array<Record<string, unknown>> = [];
      const invalid: Array<Record<string, unknown>> = [];

      const applyUpdateToArray = (arr: Array<Record<string, unknown>>, update: Record<string, unknown>) => {
        const index = arr.findIndex((entry) => matchesEntry(entry, update));
        if (index < 0) return false;

        const existing = arr[index] || {};
        arr[index] = {
          ...existing,
          link: {
            ...(typeof update.label === 'string' ? { label: update.label } : {}),
            type: 'custom',
            url: String(update.url),
            ...(typeof update.newTab === 'boolean' ? { newTab: update.newTab } : {}),
          },
        };
        return true;
      };

      for (const rawUpdate of linksInput) {
        const update = (rawUpdate || {}) as Record<string, unknown>;
        const hasSelector = update.entryId != null || typeof update.anchorId === 'string' || typeof update.title === 'string';
        if (!hasSelector) {
          invalid.push(update);
          continue;
        }

        const side = update.side === 'accountability' ? 'accountability' : update.side === 'affordability' ? 'affordability' : undefined;
        let matched = false;

        if (side === 'affordability' || !side) {
          matched = applyUpdateToArray(affordabilityEntries, update) || matched;
          matched =
            legacyCards.some((card, idx) => {
              if (String(card.side ?? '') !== 'affordability') return false;
              if (!matchesEntry(card, update)) return false;
              legacyCards[idx] = {
                ...card,
                link: {
                  ...(typeof update.label === 'string' ? { label: update.label } : {}),
                  type: 'custom',
                  url: String(update.url),
                  ...(typeof update.newTab === 'boolean' ? { newTab: update.newTab } : {}),
                },
              };
              return true;
            }) || matched;
        }

        if (side === 'accountability' || !side) {
          matched = applyUpdateToArray(accountabilityEntries, update) || matched;
          matched =
            legacyCards.some((card, idx) => {
              if (String(card.side ?? '') !== 'accountability') return false;
              if (!matchesEntry(card, update)) return false;
              legacyCards[idx] = {
                ...card,
                link: {
                  ...(typeof update.label === 'string' ? { label: update.label } : {}),
                  type: 'custom',
                  url: String(update.url),
                  ...(typeof update.newTab === 'boolean' ? { newTab: update.newTab } : {}),
                },
              };
              return true;
            }) || matched;
        }

        if (matched) {
          updatedCount += 1;
        } else {
          notFound.push(update);
        }
      }

      policyBlock.affordabilityEntries = affordabilityEntries;
      policyBlock.accountabilityEntries = accountabilityEntries;
      policyBlock.cards = legacyCards;
      layout[policyBlockIndex] = policyBlock;

      const isPublished = pageDoc._status === 'published';
      const updated = (await payload.update({
        collection: 'pages',
        id: String(pageDoc.id),
        data: {
          layout,
        },
        draft: !isPublished,
        overrideAccess: true,
        req,
      })) as unknown as Record<string, unknown>;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                action: 'updated',
                pageId: updated?.id ?? pageDoc.id,
                slug: updated?.slug ?? pageDoc.slug ?? null,
                blockId: policyBlock.id ?? null,
                requested: linksInput.length,
                updated: updatedCount,
                notFound,
                invalid,
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
        content: [{ type: 'text' as const, text: `Error updating policy voices card links: ${message}` }],
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
    IContactFolders,
    IContactLists,
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
        tools: [
          refreshIContactCacheTool,
          listIContactFoldersTool,
          listIContactListsTool,
          bulkConfigureIContactFormsTool,
          backfillIContactUnsyncedTool,
          upsertPageWithBlocksTool,
          listPageBlocksTool,
          getBlockShapeTool,
          updateBlockFieldsTool,
          listRichTextNodesTool,
          updateRichTextNodesTool,
          getEditingDefaultsTool,
          updatePolicyVoicesSpeechBubblesTool,
          updatePolicyVoicesCardLinksTool,
          bulkUpdateFormsByTitleTool,
          reorderContactFormTailFieldsTool,
        ],
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
