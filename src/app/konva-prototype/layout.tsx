import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Konva Prototype',
  description: 'Guardrailed template-editing prototype for Payload-driven graphics.',
}

export default function KonvaPrototypeLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
