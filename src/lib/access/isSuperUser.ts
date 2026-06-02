export const isSuperUser = (user: unknown): boolean => {
  if (!user || typeof user !== 'object') return false

  const maybeUser = user as { roles?: unknown; collection?: unknown }

  // MCP API key auth users can be present in req.user; they do not have role arrays.
  if (typeof maybeUser.collection === 'string' && maybeUser.collection !== 'users') {
    return false
  }

  return Array.isArray(maybeUser.roles) && maybeUser.roles.includes('super')
}

export const isAlphaTester = (user: unknown): boolean => {
  if (!user || typeof user !== 'object') return false

  const maybeUser = user as { roles?: unknown; collection?: unknown }

  if (typeof maybeUser.collection === 'string' && maybeUser.collection !== 'users') {
    return false
  }

  return Array.isArray(maybeUser.roles) && maybeUser.roles.includes('alphaTester')
}

export const canUseEmailFeatures = (user: unknown): boolean => isSuperUser(user) || isAlphaTester(user)

export const canUseBuilders = (user: unknown): boolean => isSuperUser(user) || isAlphaTester(user)
