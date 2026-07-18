import { withPayload } from '@payloadcms/next/withPayload'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import redirects from './redirects.js'

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))

const NEXT_PUBLIC_SERVER_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    qualities: [75, 100],
    remotePatterns: [
      ...[NEXT_PUBLIC_SERVER_URL /* 'https://example.com' */].map((item) => {
        const url = new URL(item)

        return {
          hostname: url.hostname,
          protocol: url.protocol.replace(':', ''),
        }
      }),
      // Allow media assets served from R2/Cloudflare via our media domain
      {
        protocol: 'https',
        hostname: 'media.cthousegop.com',
      },
    ],
  },
  reactStrictMode: true,
  turbopack: {
    root: PROJECT_ROOT,
  },
  headers: async () => {
    return [
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        ],
      },
    ]
  },
  redirects,
}

export default withPayload(nextConfig)
