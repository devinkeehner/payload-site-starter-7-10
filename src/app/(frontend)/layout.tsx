import type { Metadata } from 'next'

import { cn } from '@/lib/utils'
import { GeistSans as PrimaryFont } from 'geist/font/sans'
import { GeistMono as SecondaryFont } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider } from 'next-themes'

import { AdminBar } from '@/components/site/admin-bar'
import { Footer } from '@/components/site/footer'
import { Header } from '@/components/site/header'
import { LivePreviewListener } from '@/components/site/live-preview-listener'
import { mergeOpenGraph } from '@/lib/utilities/mergeOpenGraph'
import { draftMode } from 'next/headers'
import { getSiteSEO } from '@/lib/utilities/getSiteSEO'

import './globals.css'
import { getServerSideURL } from '@/lib/utilities/getURL'

export async function generateMetadata(): Promise<Metadata> {
  const tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG || 'candelora'
  try {
    const seo = await getSiteSEO(tenantSlug)

    if (seo) {
      return {
        metadataBase: new URL(getServerSideURL()),
        title: seo.title,
        description: seo.description,
        openGraph: mergeOpenGraph({
          title: seo.title,
          description: seo.description,
          images:
            typeof seo.metaImage === 'object' && seo.metaImage?.url
              ? [seo.metaImage.url]
              : undefined,
        }),
        twitter: {
          card: 'summary_large_image',
          creator: '@bridgertower',
        },
      }
    }
  } catch (e) {
    console.error('Failed to load site SEO', e)
  }

  return {
    metadataBase: new URL(getServerSideURL()),
    openGraph: mergeOpenGraph(),
    twitter: {
      card: 'summary_large_image',
      creator: '@bridgertower',
    },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = await draftMode()

  return (
    <html
      className={cn(PrimaryFont.variable, SecondaryFont.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <LivePreviewListener />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Header />
          {children}
          <Footer />
          <AdminBar
            adminBarProps={{
              preview: isEnabled,
            }}
          />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
