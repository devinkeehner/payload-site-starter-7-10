import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { resendAdapter } from '@payloadcms/email-resend';
import sharp from 'sharp';
import path from 'path';
import { buildConfig, PayloadRequest, type GlobalConfig } from 'payload';
import { fileURLToPath } from 'url';
import { s3Storage } from '@payloadcms/storage-s3';

// Collection imports
import { Tenants } from './collections/Tenants';
import { Categories } from './collections/Categories';
import { Media } from './collections/Media';
import { Pages } from './collections/Pages';
import { BadBills } from './collections/BadBills';
import { Posts } from './collections/Posts';
import { Users } from './collections/Users';
import { Authors } from './collections/Authors';
import { Tags } from './collections/Tags';
import { ArticleTypes } from './collections/ArticleTypes';
import { WordpressPosts } from './collections/WordpressPosts';
import { IContactFolders } from './collections/IContactFolders';
import { IContactLists } from './collections/IContactLists';
import { SitemapArtifacts } from './collections/SitemapArtifacts';
import { FacebookOAuthSessions } from './collections/FacebookOAuthSessions';
import { Emails } from './collections/Emails';
import { EmailLists } from './collections/EmailLists';
import { EmailListMemberships } from './collections/EmailListMemberships';
import { EmailSendEvents } from './collections/EmailSendEvents';
import { EmailSendJobs } from './collections/EmailSendJobs';
import { EmailImportJobs } from './collections/EmailImportJobs';
import { Contacts } from './collections/Contacts';
import { ChatgptOAuthClients } from './collections/ChatgptOAuthClients';
import { ChatgptOAuthCodes } from './collections/ChatgptOAuthCodes';
import { ChatgptOAuthTokens } from './collections/ChatgptOAuthTokens';

// Site settings and other component imports
import { Navbar } from './components/site/navbar/config';
import { StandardMedia } from './collections/StandardMedia';
import { GraphicTemplates } from './collections/GraphicTemplates';
import { GraphicDesigns } from './collections/GraphicDesigns';
import { RepInfo } from './collections/RepInfo';
import { SiteSEO } from './collections/SiteSEO';
import { Header } from './components/site/header/config';
import { Footer } from './components/site/footer/config';

// Misc imports
import { plugins } from '@/lib/plugins';
import { defaultLexical } from '@/collections/fields/defaultLexical';
import { authenticated } from '@/lib/access/authenticated';
import { isSuperUser } from '@/lib/access/isSuperUser';
import {
  DEFAULT_SEO_ASSISTANT_SETTINGS,
  SEO_ASSISTANT_MODEL_OPTIONS,
  SEO_ASSISTANT_REASONING_OPTIONS,
  SEO_ASSISTANT_TONE_OPTIONS,
} from '@/lib/seo/assistantConfig';

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

const SEOGeneratorSettingsGlobal: GlobalConfig = {
  slug: 'seo-generator-settings',
  label: 'SEO Generator Settings',
  admin: {
    group: 'Admin',
    hidden: ({ user }) => !isSuperUser(user),
  },
  access: {
    read: authenticated,
    update: ({ req }) => isSuperUser(req.user),
  },
  fields: [
    {
      name: 'defaultModel',
      label: 'Default Model',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_SEO_ASSISTANT_SETTINGS.defaultModel,
      options: SEO_ASSISTANT_MODEL_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      admin: {
        description: 'Default model used by the post publishing assistant for SEO generation.',
      },
    },
    {
      name: 'defaultReasoning',
      label: 'Default Reasoning',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_SEO_ASSISTANT_SETTINGS.defaultReasoning,
      options: SEO_ASSISTANT_REASONING_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      admin: {
        description: 'Reasoning effort for the default SEO generation run.',
      },
    },
    {
      name: 'defaultTone',
      label: 'Default Tone',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_SEO_ASSISTANT_SETTINGS.defaultTone,
      options: SEO_ASSISTANT_TONE_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      admin: {
        description: 'Default political tone used when editors have not chosen a per-post override.',
      },
    },
    {
      name: 'defaultInstructions',
      label: 'Default Instructions',
      type: 'textarea',
      admin: {
        description: 'Optional always-on guidance appended to every SEO generation request.',
      },
    },
  ],
};

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const payloadMcpPlugin =
  process.env.PAYLOAD_ENABLE_MCP === 'true'
    ? (await import('@/lib/mcp/payloadMcpPlugin')).createPayloadMcpPlugin()
    : null;

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

export default buildConfig({
  admin: {
    components: {
      Nav: '@/components/admin/nav/CampaignAdminNav#CampaignAdminNav',
      // Wrap the admin UI with providers for tenant UX
      providers: [
        '@/components/admin/TenantOptionsProvider#default',
        '@/components/admin/theme/AdminPaletteProvider#default',
        '@/components/admin/TenantSwitchGuard#default',
        '@/components/admin/TenantHeaderIndicator#default',
      ],
      graphics: {
        Icon: '@/components/admin/brand/Icon#default',
        Logo: '@/components/admin/brand/Logo#default',
      },
      views: {
        emailCampaignStart: {
          path: '/email-campaigns/start',
          Component: '@/components/admin/email-start/EmailStartView#default',
        },
        iContactImport: {
          path: '/email-imports/icontact',
          Component: '@/components/admin/email-imports/IContactImportView#default',
        },
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
    dashboard: {
      defaultLayout: [
        { widgetSlug: 'quickTasks', width: 'full' },
        { widgetSlug: 'websiteShortcuts', width: 'full' },
        { widgetSlug: 'homepageBanner', width: 'medium' },
        { widgetSlug: 'siteManagement', width: 'medium' },
      ],
      widgets: [
        {
          slug: 'quickTasks',
          Component: '@/components/admin/dashboard/DashboardWidgets#QuickTasksWidget',
          label: 'Common Tasks',
          minWidth: 'full',
        },
        {
          slug: 'iconCollectionLauncher',
          Component: '@/components/admin/dashboard/DashboardWidgets#IconCollectionLauncherWidget',
          label: 'Collections',
          minWidth: 'full',
        },
        {
          slug: 'recentActivity',
          Component: '@/components/admin/dashboard/DashboardWidgets#RecentActivityWidget',
          label: 'Recent Activity',
          minWidth: 'full',
        },
        {
          slug: 'drafts',
          Component: '@/components/admin/dashboard/DashboardWidgets#DraftsWidget',
          label: 'Drafts',
          minWidth: 'full',
        },
        {
          slug: 'websiteShortcuts',
          Component: '@/components/admin/dashboard/DashboardWidgets#WebsiteShortcutsWidget',
          label: 'Website Shortcuts',
          minWidth: 'full',
        },
        {
          slug: 'homepageBanner',
          Component: '@/components/admin/dashboard/DashboardWidgets#HomepageBannerWidget',
          label: 'Website Images',
          minWidth: 'medium',
        },
        {
          slug: 'siteManagement',
          Component: '@/components/admin/dashboard/DashboardWidgets#SiteManagementWidget',
          label: 'Site Management',
          minWidth: 'medium',
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
    BadBills,
    Media,
    GraphicTemplates,
    GraphicDesigns,
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
    Emails,
    EmailLists,
    EmailListMemberships,
    EmailSendEvents,
    EmailSendJobs,
    EmailImportJobs,
    Contacts,
    ChatgptOAuthClients,
    ChatgptOAuthCodes,
    ChatgptOAuthTokens,
    SitemapArtifacts,
    FacebookOAuthSessions,
  ],

  cors: {
    origins: ['https://www.cthousegop.com', 'https://cthousegop.com', 'http://localhost:3000'],
    headers: ['Content-Type', 'Authorization', 'x-turnstile-token'],
  },

  globals: [Header, Footer, GlobalMetaSEOGlobal, SEOGeneratorSettingsGlobal],

  plugins: [
    ...(payloadMcpPlugin ? [payloadMcpPlugin] : []),

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
        const existingViews = (forms.admin?.components?.views || {}) as Record<string, any>
        const existingEditViews = (existingViews.edit || {}) as Record<string, any>
        forms.admin = {
          ...(forms.admin || {}),
          components: {
            ...(forms.admin?.components || {}),
            views: {
              ...existingViews,
              edit: {
                ...existingEditViews,
                default: {
                  ...(existingEditViews.default || {}),
                  tab: {
                    href: '/',
                    label: 'Advanced',
                    order: 200,
                    ...(existingEditViews.default?.tab || {}),
                  },
                },
                visual: {
                  ...(existingEditViews.visual || {}),
                  Component: '@/components/admin/form/PuckFormBuilderView#default',
                  path: '/visual',
                  tab: {
                    href: '/visual',
                    label: 'Builder',
                    order: 75,
                    ...(existingEditViews.visual?.tab || {}),
                  },
                },
              },
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
