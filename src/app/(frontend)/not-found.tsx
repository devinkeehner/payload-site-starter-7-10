import Link from 'next/link'
import React from 'react'

import { Section, Container } from '@/components/layout'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <Section>
      <Container>
        <div className="ds spaced">
          <h1>404</h1>
          <p className="mb-4">This page could not be found.</p>
        </div>
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
      </Container>
    </Section>
  )
}
