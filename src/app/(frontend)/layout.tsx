import type { Metadata } from 'next'

import { cn } from '@/lib/utils'
import { GeistSans as PrimaryFont } from 'geist/font/sans'
import { GeistMono as SecondaryFont } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider } from 'next-themes'

import { AdminBar } from '@/components/site/admin-bar'
import { Footer } from '@/components/site/footer'
import { Header } from '@/components/site/header'
import { mergeOpenGraph } from '@/lib/utilities/mergeOpenGraph'
import { draftMode } from 'next/headers'

import './globals.css'
import { getServerSideURL } from '@/lib/utilities/getURL'

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
  openGraph: mergeOpenGraph(),
  twitter: {
    card: 'summary_large_image',
    creator: '@bridgertower',
  },
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
        <AdminBar
          adminBarProps={{
            preview: isEnabled,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Header />
          {children}
          <Footer />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
