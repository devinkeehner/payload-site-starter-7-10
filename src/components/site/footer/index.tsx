import { Section, Container } from '@/components/layout'
import Link from 'next/link'
import React from 'react'

import { getCachedGlobal } from '@/lib/utilities/getGlobals'

import { ThemeSelector } from '@/providers/theme/ThemeSelector'
import { CMSLink } from '@/components/site/link'

import type { Footer } from '@/payload-types'

export async function Footer() {
  const footerData: Footer = await getCachedGlobal('footer', 1)()

  const navItems = footerData?.navItems || []

  return (
    <footer>
      <Section>
        <Container className="grid grid-cols-[auto_1fr] gap-6">
          <Link className="text-2xl font-semibold tracking-tight leading-0" href="/">
            Payload Site Starter
          </Link>

          <div className="flex flex-col-reverse items-start md:flex-row gap-4 md:items-center">
            <ThemeSelector />
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
