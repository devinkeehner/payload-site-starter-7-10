const registryKey = '__hroAdminUnsavedChangeSources'

type RegistryHost = typeof globalThis & {
  [registryKey]?: Set<string>
}

function getRegistry() {
  const host = globalThis as RegistryHost
  if (!host[registryKey]) host[registryKey] = new Set<string>()
  return host[registryKey]
}

export function setAdminUnsavedChanges(source: string, dirty: boolean) {
  const registry = getRegistry()
  if (dirty) registry.add(source)
  else registry.delete(source)
}

export function hasAdminUnsavedChanges() {
  return getRegistry().size > 0
}

export function clearAdminUnsavedChanges(source: string) {
  getRegistry().delete(source)
}
