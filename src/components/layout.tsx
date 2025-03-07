import { cn } from '@/lib/utils'

type LayoutProps = {
  children: React.ReactNode
  className?: string
  id?: string
  style?: React.CSSProperties
  dangerouslySetInnerHTML?: { __html: string }
}

export const Section = ({ children, className, id, style }: LayoutProps) => (
  <section className={cn('py-6 sm:py-8', className)} id={id} style={style}>
    {children}
  </section>
)

export const Container = ({ children, className, id, style }: LayoutProps) => (
  <div className={cn('max-w-6xl mx-auto p-3 sm:p-6', className)} id={id} style={style}>
    {children}
  </div>
)

export const Layout = ({ children, className, style }: LayoutProps) => (
  <html
    lang="en"
    suppressHydrationWarning
    className={cn('scroll-smooth antialiased focus:scroll-auto', className)}
    style={style}
  >
    {children}
  </html>
)

export const Main = ({ children, className, id, style }: LayoutProps) => (
  <main className={cn('', className)} id={id} style={style}>
    {children}
  </main>
)

export const Article = ({
  children,
  className,
  id,
  dangerouslySetInnerHTML,
  style,
}: LayoutProps) => (
  <article
    dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    className={cn('ds max-w-prose', className)}
    id={id}
    style={style}
  >
    {children}
  </article>
)
