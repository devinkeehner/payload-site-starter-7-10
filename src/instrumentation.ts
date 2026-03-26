import { triggerSitemapBootstrapOnStartup } from '@/lib/sitemap-bootstrap'

export async function register(): Promise<void> {
  void triggerSitemapBootstrapOnStartup()
}
