import { Section, Container } from '@/components/craft'
import { HeaderNav } from './nav'
import Link from 'next/link'
import { getCachedGlobal } from '@/lib/utilities/getGlobals'

import type { Header } from '@/payload-types'

export async function Header() {
  const headerData: Header = await getCachedGlobal('header', 1)()

  return (
    <header className="">
      <Section className="py-0 lg:py-0">
        <Container className="flex justify-between">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            Site Starter
          </Link>
          <HeaderNav data={headerData} />
        </Container>
      </Section>
    </header>
  )
}
