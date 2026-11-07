import type { ReactNode } from 'react'
import './live-editor.css'

export const metadata = { title: 'Live Editor', robots: { index: false, follow: false } }
/** A separate root layout: Payload's RootLayout, header and navigation never mount. */
export default function LiveEditorLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
