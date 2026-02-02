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

// Inline Global Meta & SEO (Payload Global - site-wide)
const GlobalMetaSEOGlobal: GlobalConfig = {
  slug: 'global-meta-seo',
  label: 'Global Meta & SEO',
  admin: {
    group: 'Admin',
    hidden: ({ user }) => !user?.roles?.includes('super'),
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
