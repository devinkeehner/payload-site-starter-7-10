'use client'

import React from 'react'

import type { Navbar as NavbarType } from '@/payload-types'

import { CMSLink } from '@/components/site/link'
import { Button } from '@/components/ui/button'
import { Github } from 'lucide-react'
import Link from 'next/link'
import { SearchIcon } from 'lucide-react'

export const NavbarNav = ({ data }: { data: NavbarType }) => {
  const navItems = data?.navItems || []

  return (
    <nav className="flex gap-3 items-center">
      {navItems.map(({ link }, i) => {
        return <CMSLink key={i} {...link} appearance="link" />
      })}
      <Link href="/search">
        <span className="sr-only">Search</span>
        <SearchIcon className="w-5 text-primary" />
      </Link>
      <Button asChild size="icon">
        <Link target="_blank" rel="noopener" href="https://github.com/brijr/payload-site-starter">
          <Github size={18} aria-label="GitHub" />
        </Link>
      </Button>
    </nav>
  )
}
