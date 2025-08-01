import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder';
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

// Misc imports
import CustomDashboard from './components/admin/CustomDashboard';
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
        { label: 'Mobile', name: 'mobile', width: 375, height: 667 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
      ],
    },
  },

  // Default editor configuration (Lexical)
  editor: defaultLexical,

  // Database configuration
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || '',
  }),

  // Define collections in the desired order; forms will be inserted later.
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
    // Misc
    Authors,
    Tags,
  ],

  cors: '*',

  globals: [Header, Footer],

  plugins: [
    // Spread any additional plugins you’ve defined elsewhere
    ...plugins,

    // Register the Form Builder plugin and assign the form collections to “Forms & Submissions”.
    formBuilderPlugin({
      fields: {
        radio: true,
        'checkbox-group': {
          slug: 'checkbox-group',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'name', type: 'text', label: 'Name (lowercase, no special characters)', required: true, admin: { width: '50%' } },
                { name: 'label', type: 'text', label: 'Label', localized: true, admin: { width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'width', type: 'number', label: 'Field Width (percentage)', admin: { width: '50%' } },
              ],
            },
            {
              name: 'options',
              type: 'array',
              label: 'Checkbox Options',
              labels: { singular: 'Option', plural: 'Options' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'label', type: 'text', label: 'Label', localized: true, required: true, admin: { width: '50%' } },
                    { name: 'value', type: 'text', label: 'Value', required: true, admin: { width: '50%' } },
                  ],
                },
              ],
            },
            { name: 'required', type: 'checkbox', label: 'Required' },
          ],
          labels: { singular: 'Checkbox Group', plural: 'Checkbox Groups' },
21z5xa-codex/add-multiple-choice-radio-button-field
        } as any,
      },
      formOverrides: {
        admin: { group: 'Forms & Submissions' },
      },
      formSubmissionOverrides: {
        admin: { group: 'Forms & Submissions' },
      },
    }),

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

      if (siteIndex !== -1 && forms && submissions) {
        filtered.splice(siteIndex + 1, 0, forms, submissions);
      }

      config.collections = filtered;
      return config;
    },

    // S3 storage plugin for media uploads
    s3Storage({
      collections: { media: true },
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

