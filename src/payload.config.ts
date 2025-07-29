import { mongooseAdapter } from '@payloadcms/db-mongodb';
import sharp from 'sharp';
import path from 'path';
import { buildConfig, PayloadRequest } from 'payload';
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
import { WordpressPosts } from './collections/WordpressPosts';

// Site settings and other component imports
import { Navbar } from './components/site/navbar/config';
import { StandardMedia } from './collections/StandardMedia';
import { RepInfo } from './collections/RepInfo';
import { SiteSEO } from './collections/SiteSEO';
import { Header } from './components/site/header/config';
import { Footer } from './components/site/footer/config';
import CustomDashboard from './components/admin/CustomDashboard';

// Local utilities and plugin list
import { plugins } from '@/lib/plugins';
import { CONTENT_COLLECTIONS } from './components/admin/collectionGroups';
import { defaultLexical } from '@/collections/fields/defaultLexical';
import { getServerSideURL } from '@/lib/utilities/getURL';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    components: {
      views: {
        Dashboard: {
          Component: './components/admin/CustomDashboard',
          path: '/',
        } as any,
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },

  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,

  db: mongooseAdapter({
    url: process.env.MONGODB_URI || '',
  }),

  // Define collections in the desired group order: Content, Site Settings, Admin, Misc.
  // (Forms and Form Submissions will be repositioned by the inline plugin below.)
  collections: [
    // Content
    Posts,
    Pages,
    WordpressPosts,
    Media,
    // Site Settings
    RepInfo,
    Navbar,
    StandardMedia,
    SiteSEO,
    // Admin
    Categories,
    Users,
    Tenants,
    // Misc (hidden)
    Authors,
    Tags,
  ],

  cors: '*',

  globals: [Header, Footer],

  plugins: [
    // Spread any additional plugins you’ve defined elsewhere
    ...plugins,

    // Inline plugin to reposition the form and form-submissions collections.
    // It moves them immediately after the last "Site Settings" collection (`site-seo`).
    (config) => {
      // Create a safe, mutable copy of the collections array
      const allCollections = Array.isArray(config.collections)
        ? [...config.collections]
        : [];

      // Locate the auto‑generated form collections
      const forms = allCollections.find((c) => c.slug === 'forms');
      const submissions = allCollections.find((c) => c.slug === 'form-submissions');

      // Remove the form collections from the copy
      const filtered = allCollections.filter(
        (c) => !['forms', 'form-submissions'].includes(c.slug),
      );

      // Find the index of the last “Site Settings” collection (assumes slug 'site-seo')
      const siteIndex = filtered.findIndex((c) => c.slug === 'site-seo');

      // Insert the form collections after the site settings section
      if (siteIndex !== -1 && forms && submissions) {
        filtered.splice(siteIndex + 1, 0, forms, submissions);
      }

      // Assign the reordered array back to the config
      config.collections = filtered;
      return config;
    },

    // S3 storage plugin for media uploads
    s3Storage({
      collections: {
        media: true,
      },
      bucket: process.env.R2_BUCKET || '',
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
        // Allow logged-in users to execute this endpoint (default)
        if (req.user) return true;

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization');
        return authHeader === `Bearer ${process.env.CRON_SECRET}`;
      },
    },
    tasks: [],
  },
});
