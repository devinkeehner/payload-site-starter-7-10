export const mailPDFNameHeader = 'X-Mail-Tool-Filename'

const defaultStem = 'mailer-two-up-letter'
const maxStemLength = 72

export function getMailPDFStem(filename?: string | null): string {
  const basename = filename?.split(/[\\/]/u).pop()?.trim() ?? ''
  const stem = basename
    .replace(/\.(?:pdf|png|jpe?g)$/iu, '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^[\p{M}-]+/u, '')

  return Array.from(stem).slice(0, maxStemLength).join('').replace(/-$/u, '') || defaultStem
}
