export async function register(): Promise<void> {
  // Startup sitemap bootstrap is disabled here because importing Payload config
  // from instrumentation pulls MCP dependencies into the Next instrumentation build.
  // Sitemap artifacts still bootstrap on demand via the sitemap routes.
}
