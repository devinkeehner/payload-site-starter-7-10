import { Section, Container } from '@/components/layout'
import { ThemeToggle } from '@/components/theme-toggle'
import { CMSLink } from '@/components/site/link'

import Link from 'next/link'
import React from 'react'

import { getCachedGlobal } from '@/lib/utilities/getGlobals'

import type { Footer } from '@/payload-types'

export async function Footer() {
  const footerData: Footer = await getCachedGlobal('footer', 1)()

  const navItems = footerData?.navItems || []

  return (
    <footer>
      <Section className="border-t bg-accent/30">
        <Container className="flex items-start justify-between gap-6">
          <div className="grid gap-2">
            <Link className="text-2xl font-semibold tracking-tight" href="/">
              Payload Site Starter
            </Link>
            <p className="text-muted-foreground">
              Opinionated starter for building websites with Payload and Next.js
            </p>
          </div>
          <div className="flex">
            <ThemeToggle />
            <nav className="flex flex-col md:flex-row gap-4">
              {navItems.map(({ link }, i) => {
                return <CMSLink className="text-white" key={i} {...link} />
              })}
            </nav>
          </div>
        </Container>
      </Section>
    </footer>
  )
}
