import type { ReactNode } from 'react'

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ margin: 0, background: '#f5f7f8', fontFamily: 'Arial, sans-serif' }}>{children}</body></html>
}
