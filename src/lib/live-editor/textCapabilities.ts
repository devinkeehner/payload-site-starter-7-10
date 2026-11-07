/** Gov email renderers consume native fields; companion website text is unsupported. */
export const unsteadyCompanionTextPaths: Record<string, readonly string[]> = {}

export function isUnsteadyCompanionTextField(_blockType: string, _path: readonly (string | number)[]): boolean {
  return false
}

export function getUnsteadyCompanionFields(_blockType: string, _ownerPath: readonly (string | number)[]): string[] {
  return []
}
