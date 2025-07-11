import { Section, Container } from '@/components/layout'
import { NavbarNav } from './nav'

import Link from 'next/link'
import Image from 'next/image'

import { getCachedGlobal } from '@/lib/utilities/getGlobals'
import { config } from '@/site.config'

import type { Navbar as NavbarType } from '@/payload-types'

export async function Navbar() {
  const navbarData: NavbarType = await getCachedGlobal('navbar', 1)()

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
      <Section className="py-0 sm:py-0">
        <Container className="flex justify-between items-center py-2 sm:py-3">
          <Link href="/">
            <Image
              src={config.logo.path}
              alt={config.name}
              width={config.logo.width}
              height={config.logo.height}
            />
            <span className="sr-only">{config.name}</span>
          </Link>
          <NavbarNav data={navbarData} />
        </Container>
      </Section>
    </header>
  )
}
