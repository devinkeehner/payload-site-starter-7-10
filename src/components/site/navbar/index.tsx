import { Section, Container } from '@/components/layout'
import { NavbarNav } from './nav'

import Link from 'next/link'
import Image from 'next/image'

import { config } from '@/site.config'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import type { Navbar as NavbarType } from '@/payload-types'

export async function Navbar() {
  const payload = await getPayload({ config: configPromise })
  const navbars = await payload.find({
    collection: 'navbars',
    where: {
      name: {
        equals: 'Main Navbar',
      },
    },
  })

  const navbar = navbars.docs[0] as NavbarType | null

  if (!navbar) {
    return null
  }

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
          <NavbarNav data={navbar} />
        </Container>
      </Section>
    </header>
  )
}
