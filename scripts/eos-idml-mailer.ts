import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

type UnknownRecord = Record<string, unknown>

type TenantDoc = {
  id: string
  name?: string
  slug?: string
  archived?: boolean
}

type MediaDoc = {
  id?: string
  filename?: string
  url?: string
  mimeType?: string
  sizes?: Record<string, { url?: string | null; filename?: string | null } | null>
}

type RepInfoDoc = {
  id: string
  tenant?: string | TenantDoc | null
  officeTitle?: string | null
  name?: string | null
  districtNumber?: number | null
  towns?: { town?: string | null }[] | null
  facebook?: string | null
  youtube?: string | null
  instagram?: string | null
  x?: string | null
}

type StandardMediaDoc = {
  id: string
  tenant?: string | TenantDoc | null
  bannerImage?: string | MediaDoc | null
  mobileHeadshot?: string | MediaDoc | null
}

type NavbarDoc = {
  id: string
  tenant?: string | TenantDoc | null
  navItems?: NavItem[] | null
}

type NavItem = {
  link?: { label?: string | null; url?: string | null } | null
  subNav?: NavItem[] | null
  subSubNav?: NavItem[] | null
}

type DataSet = {
  tenants: TenantDoc[]
  repInfo: RepInfoDoc[]
  standardMedia: StandardMediaDoc[]
  navbars: NavbarDoc[]
}

type RepExport = {
  tenant: TenantDoc
  repInfo: RepInfoDoc
  standardMedia?: StandardMediaDoc
  navbar?: NavbarDoc
  firstName: string
  lastName: string
  fullName: string
  websiteDisplay: string
  websiteUrl: string
  surveyDisplay: string
  surveyUrl: string
  email: string
  phone: string
  districtLabel: string
  officeTitle: string
  officeTitleLines: string
  towns: string[]
  townsText: string
  committees: string[]
  committeesText: string
  handles: Record<string, string>
}

type CliOptions = {
  templateIdml: string
  taggedTemplate: string
  outputRoot: string
  apiOrigin: string
  tenant?: string
  all: boolean
  dataJson?: string
  skipDownloads: boolean
}

type AssetResult = {
  imageUris: Record<string, string>
  relinkUris: Record<string, string>
  copiedAssets: string[]
  missingAssets: string[]
}

const DEFAULT_TEMPLATE =
  '/mnt/c/Users/Devin Keehner/Downloads/eos template 2025 Folder/eos template 2025.idml'
const DEFAULT_OUTPUT_ROOT = '/mnt/c/Users/Devin Keehner/Downloads/eos-mailer-exports'
const DEFAULT_API_ORIGIN = 'https://admin.cthousegop.com'
const EXCLUDED_TENANT_SLUGS = new Set(['main', 'test', 'hro4200!'])

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}

const getString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const getTenantID = (value: unknown): string => {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  return getString(record.id) || getString(record._id)
}

const getTenantSlug = (value: unknown): string => {
  if (typeof value === 'string') return ''
  return getString(asRecord(value).slug)
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tenant'

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2)
  const options: CliOptions = {
    templateIdml: DEFAULT_TEMPLATE,
    taggedTemplate: '',
    outputRoot: DEFAULT_OUTPUT_ROOT,
    apiOrigin: DEFAULT_API_ORIGIN,
    tenant: 'candelora',
    all: false,
    skipDownloads: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const readValue = () => {
      const next = args[index + 1]
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      index += 1
      return next
    }

    if (arg === '--template-idml') options.templateIdml = readValue()
    else if (arg === '--tagged-template') options.taggedTemplate = readValue()
    else if (arg === '--output-root') options.outputRoot = readValue()
    else if (arg === '--api-origin') options.apiOrigin = readValue().replace(/\/+$/g, '')
    else if (arg === '--tenant') {
      options.tenant = readValue()
      options.all = false
    } else if (arg === '--all') {
      options.all = true
      options.tenant = undefined
    } else if (arg === '--data-json') options.dataJson = readValue()
    else if (arg === '--skip-downloads') options.skipDownloads = true
    else if (arg === '--') continue
    else if (arg === '--help') {
      console.log(`Usage:
  pnpm mailer:eos -- --tenant candelora
  pnpm mailer:eos -- --all

Options:
  --template-idml <path>    Source IDML package
  --tagged-template <path>  Tagged template copy path
  --output-root <path>      Output directory
  --api-origin <url>        Payload API origin
  --data-json <path>        Use pre-fetched data instead of live API
  --skip-downloads          Do not download remote images
`)
      process.exit(0)
    } else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.taggedTemplate) {
    const parsed = path.parse(options.templateIdml)
    options.taggedTemplate = path.join(parsed.dir, `${parsed.name}.tagged${parsed.ext}`)
  }

  return options
}

const fetchCollection = async <T>(origin: string, collection: string, depth = 2): Promise<T[]> => {
  const docs: T[] = []
  let page = 1
  let totalPages = 1

  do {
    const url = new URL(`/api/${collection}`, origin)
    url.searchParams.set('limit', '100')
    url.searchParams.set('page', String(page))
    url.searchParams.set('depth', String(depth))
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${collection}: ${response.status} ${response.statusText}`)
    }
    const payload = (await response.json()) as { docs?: T[]; totalPages?: number }
    docs.push(...(Array.isArray(payload.docs) ? payload.docs : []))
    totalPages = Number(payload.totalPages || 1)
    page += 1
  } while (page <= totalPages)

  return docs
}

const loadDataSet = async (options: CliOptions): Promise<DataSet> => {
  if (options.dataJson) {
    return JSON.parse(await fs.readFile(options.dataJson, 'utf8')) as DataSet
  }

  const [tenants, repInfo, standardMedia, navbars] = await Promise.all([
    fetchCollection<TenantDoc>(options.apiOrigin, 'tenants', 0),
    fetchCollection<RepInfoDoc>(options.apiOrigin, 'rep-info', 2),
    fetchCollection<StandardMediaDoc>(options.apiOrigin, 'standard-media', 2),
    fetchCollection<NavbarDoc>(options.apiOrigin, 'navbars', 2),
  ])

  return { tenants, repInfo, standardMedia, navbars }
}

const splitName = (name: string, tenantName = '') => {
  const source = name || tenantName
  const pieces = source.trim().split(/\s+/).filter(Boolean)
  if (pieces.length >= 2) {
    return {
      firstName: pieces[0],
      lastName: pieces.slice(1).join(' '),
      fullName: source.trim(),
    }
  }

  if (tenantName.includes(',')) {
    const [last, first] = tenantName.split(',').map((part) => part.trim())
    return {
      firstName: first || '',
      lastName: last || source,
      fullName: [first, last].filter(Boolean).join(' ') || source,
    }
  }

  return { firstName: pieces[0] || source, lastName: pieces[0] || source, fullName: source }
}

const cleanNameForDomain = (lastName: string) => lastName.replace(/[^A-Za-z]/g, '')

const cleanNameForEmail = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase()

const ordinal = (value: number) => {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

const formatTowns = (towns: string[]) => {
  if (!towns.length) return ''
  const perRow = towns.length > 4 ? 3 : 2
  const rows: string[] = []
  for (let index = 0; index < towns.length; index += perRow) {
    rows.push(towns.slice(index, index + perRow).join('  |  '))
  }
  return rows.join('\n')
}

const flattenCommittees = (navbar?: NavbarDoc) => {
  const item = (navbar?.navItems || []).find((entry) => {
    const label = entry?.link?.label || ''
    return /committees?/i.test(label)
  })
  const labels: string[] = []
  for (const sub of item?.subNav || []) {
    if (sub?.link?.label) labels.push(sub.link.label.trim())
    for (const subSub of sub?.subSubNav || []) {
      if (subSub?.link?.label) labels.push(subSub.link.label.trim())
    }
  }
  return [...new Set(labels.filter(Boolean))]
}

const handleFromUrl = (url: string | null | undefined, fallback: string) => {
  const value = (url || '').trim()
  if (!value) return fallback
  try {
    const parsed = new URL(value)
    const firstPath = parsed.pathname.split('/').filter(Boolean)[0]
    if (!firstPath || /playlist|watch|photos|collections/i.test(firstPath)) return fallback
    return `@${firstPath.replace(/^@/, '')}`
  } catch {
    const match = value.match(/@[\w.-]+/)
    return match?.[0] || fallback
  }
}

const chooseMediaUrl = (media: unknown) => {
  const record = asRecord(media)
  const direct = getString(record.url)
  if (direct) return direct
  const sizes = asRecord(record.sizes)
  for (const key of ['xlarge', 'large', 'og', 'medium', 'small', 'square']) {
    const url = getString(asRecord(sizes[key]).url)
    if (url) return url
  }
  return ''
}

const mediaExtension = (media: unknown, fallback: string) => {
  const record = asRecord(media)
  const filename = getString(record.filename) || chooseMediaUrl(media)
  const ext = path.extname(filename.split('?')[0])
  return ext || fallback
}

const normalizeRemoteUrl = (value: string) => {
  const parsed = new URL(value)
  parsed.pathname = parsed.pathname
    .split('/')
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join('/')
  return parsed.toString()
}

const downloadFile = async (url: string, destination: string) => {
  const response = await fetch(normalizeRemoteUrl(url))
  if (!response.ok) throw new Error(`Download failed for ${url}: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(destination, buffer)
}

const toWindowsFileUri = (filePath: string) => {
  const absolute = path.resolve(filePath)
  const match = absolute.match(/^\/mnt\/([a-z])\/(.+)$/i)
  if (match) {
    const drive = match[1].toUpperCase()
    const rest = match[2]
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `file:${drive}:/${rest}`
  }
  return `file://${absolute.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`
}

const fileUriToLocalPath = (uri: string) => {
  if (!uri.startsWith('file:')) return ''
  const raw = uri.replace(/^file:/, '')
  const decoded = decodeURIComponent(raw)
  const windowsMatch = decoded.match(/^\/?([A-Za-z]):\/(.+)$/)
  if (windowsMatch) {
    return `/mnt/${windowsMatch[1].toLowerCase()}/${windowsMatch[2]}`
  }
  if (decoded.startsWith('//')) return decoded.slice(1)
  return decoded
}

const uniqueDestinationPath = async (dir: string, filename: string) => {
  const parsed = path.parse(filename)
  let candidate = path.join(dir, filename)
  let index = 2
  while (true) {
    try {
      await fs.access(candidate)
      candidate = path.join(dir, `${parsed.name}-${index}${parsed.ext}`)
      index += 1
    } catch {
      return candidate
    }
  }
}

const collectLinkedAssetUris = async (zip: JSZip) => {
  const uris = new Set<string>()
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('Spreads/') || !name.endsWith('.xml')) continue
    const xml = await zip.file(name)!.async('string')
    for (const match of xml.matchAll(/\bLinkResourceURI="([^"]+)"/g)) {
      const uri = match[1]
      if (uri) uris.add(uri)
    }
  }
  return [...uris]
}

const prepareExportRows = (data: DataSet, options: CliOptions): RepExport[] => {
  const tenantsByID = new Map(data.tenants.map((tenant) => [tenant.id, tenant]))
  const standardByTenant = new Map<string, StandardMediaDoc>()
  for (const doc of data.standardMedia) {
    const tenantID = getTenantID(doc.tenant)
    if (tenantID) standardByTenant.set(tenantID, doc)
  }

  const navByTenant = new Map<string, NavbarDoc>()
  for (const doc of data.navbars) {
    const tenantID = getTenantID(doc.tenant)
    if (tenantID) navByTenant.set(tenantID, doc)
  }

  return data.repInfo
    .map((repInfo) => {
      const tenantID = getTenantID(repInfo.tenant)
      const tenant =
        tenantsByID.get(tenantID) ||
        ({
          id: tenantID,
          slug: getTenantSlug(repInfo.tenant),
          name: getString(asRecord(repInfo.tenant).name),
        } satisfies TenantDoc)
      const slug = tenant.slug || getTenantSlug(repInfo.tenant)
      if (!tenantID || !slug || tenant.archived || EXCLUDED_TENANT_SLUGS.has(slug)) return null
      if (options.tenant && slug !== options.tenant) return null

      const { firstName, lastName, fullName } = splitName(repInfo.name || '', tenant.name)
      const domainLast = cleanNameForDomain(lastName)
      const websiteDisplay = `www.Rep${domainLast}.com`
      const surveyDisplay = `REP${domainLast.toUpperCase()}.COM/SURVEY`
      const towns = (repInfo.towns || []).map((row) => (row.town || '').trim()).filter(Boolean)
      const districtNumber = Number(repInfo.districtNumber || 0)
      const officeTitle = (repInfo.officeTitle || 'State Representative').trim()
      const navbar = navByTenant.get(tenantID)
      const committees = flattenCommittees(navbar)
      const handles = {
        facebook: handleFromUrl(repInfo.facebook, '@cthousegop'),
        instagram: handleFromUrl(repInfo.instagram, '@cthousegop'),
        youtube: handleFromUrl(repInfo.youtube, '@CTHouseRepublicans'),
        x: handleFromUrl(repInfo.x, '@cthousegop'),
      }

      return {
        tenant,
        repInfo,
        standardMedia: standardByTenant.get(tenantID),
        navbar,
        firstName,
        lastName,
        fullName,
        websiteDisplay,
        websiteUrl: `https://Rep${domainLast}.com`,
        surveyDisplay,
        surveyUrl: `https://Rep${domainLast}.com/survey`,
        email: `${cleanNameForEmail(firstName)}.${cleanNameForEmail(lastName)}@housegop.ct.gov`,
        phone: '860-240-8700',
        districtLabel: districtNumber ? `${ordinal(districtNumber)} General Assembly District` : 'General Assembly District',
        officeTitle,
        officeTitleLines: officeTitle.replace(/\s*\|\s*/g, '\n'),
        towns,
        townsText: formatTowns(towns),
        committees,
        committeesText: committees.join('\n'),
        handles,
      } satisfies RepExport
    })
    .filter((row): row is RepExport => Boolean(row))
}

const getStoryIDFromName = (storyName: string) => storyName.replace(/^Stories\/Story_/, '').replace(/\.xml$/, '')

const storyText = (xml: string) => {
  const parts = [...xml.matchAll(/<Content>([\s\S]*?)<\/Content>|<Br\s*\/>/g)].map((match) =>
    match[0].startsWith('<Br') ? '\n' : decodeXml(match[1] || ''),
  )
  return parts.join('').replace(/\u2028/g, '\n').trim()
}

const attr = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
  return match?.[1] || ''
}

const setAttr = (tag: string, name: string, value: string) => {
  const escaped = escapeXml(value).replace(/"/g, '&quot;')
  if (new RegExp(`\\b${name}="`).test(tag)) {
    return tag.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${escaped}"`)
  }
  return tag.replace(/>$/, ` ${name}="${escaped}">`)
}

const pageNameForSpread = (xml: string) => attr(xml.match(/<Page\b[^>]*>/)?.[0] || '', 'Name')

const classifyTextTag = (text: string, page: string, socialIndex: number) => {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lower = normalized.toLowerCase()
  if (normalized === 'FIRST &LAST NAME' || normalized === 'FIRST LAST NAME') return `P${page}_COVER_NAME`
  if (normalized === 'FIRST AND LAST NAME') return `P${page}_FULL_NAME`
  if (normalized === 'STATE REPRESENTATIVE') return `P${page}_OFFICE_TITLE`
  if (/^xxth general assembly district$/i.test(normalized)) return `P${page}_DISTRICT_LABEL`
  if (/^town\s*\|/i.test(normalized)) return `P${page}_TOWNS`
  if (/^www\.repname\.com$/i.test(normalized)) return `P${page}_WEBSITE`
  if (/^fname\.lname@housegop\.ct\.gov$/i.test(normalized)) return `P${page}_EMAIL`
  if (/^judiciary/i.test(normalized)) return `P${page}_COMMITTEES`
  if (/^rep\. first and last$/i.test(normalized)) return `P${page}_INSIDE_HEADER_NAME`
  if (/^representative \[name\] in action$/i.test(normalized)) return `P${page}_ACTION_TITLE`
  if (/^replastname\.com\/survey$/i.test(normalized)) return `P${page}_SURVEY_URL`
  if (lower.startsWith('@')) {
    const socialTags = ['FACEBOOK_HANDLE', 'INSTAGRAM_HANDLE', 'YOUTUBE_HANDLE', 'X_HANDLE']
    return `P${page}_${socialTags[socialIndex] || 'SOCIAL_HANDLE'}`
  }
  return ''
}

const classifyImageTag = (uri: string, transform: string, page: string) => {
  if (/Candelora_Circle/i.test(uri)) return `P${page}_HEADSHOT`
  return ''
}

const tagSpreadXml = (xml: string, stories: Map<string, string>) => {
  const page = pageNameForSpread(xml)
  if (!page) return xml
  let socialIndex = 0
  let next = xml.replace(/<TextFrame\b[^>]*>/g, (tag) => {
    const storyID = attr(tag, 'ParentStory')
    const text = stories.get(storyID) || ''
    const tagName = classifyTextTag(text, page, socialIndex)
    if (text.trim().startsWith('@')) socialIndex += 1
    return tagName ? setAttr(tag, 'Name', `EOSTAG:${tagName}`) : tag
  })

  next = next.replace(/<Rectangle\b[\s\S]*?<\/Rectangle>/g, (block) => {
    const open = block.match(/<Rectangle\b[^>]*>/)?.[0]
    if (!open) return block
    const uri = attr(block.match(/<Link\b[^>]*LinkResourceURI="[^"]*"[^>]*>/)?.[0] || '', 'LinkResourceURI')
    const tagName = classifyImageTag(uri, attr(open, 'ItemTransform'), page)
    return tagName ? block.replace(open, setAttr(open, 'Name', `EOSTAG:${tagName}`)) : block
  })

  return next
}

const buildTaggedTemplate = async (sourceIdml: string, taggedTemplate: string) => {
  const buffer = await fs.readFile(sourceIdml)
  const zip = await JSZip.loadAsync(buffer)
  const stories = new Map<string, string>()

  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('Stories/Story_') || !name.endsWith('.xml')) continue
    const xml = await zip.file(name)!.async('string')
    stories.set(getStoryIDFromName(name), storyText(xml))
  }

  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('Spreads/') || !name.endsWith('.xml')) continue
    const xml = await zip.file(name)!.async('string')
    zip.file(name, tagSpreadXml(xml, stories))
  }

  await fs.mkdir(path.dirname(taggedTemplate), { recursive: true })
  await fs.writeFile(taggedTemplate, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

const textForTag = (tagName: string, row: RepExport) => {
  const key = tagName.replace(/^P\d+_/, '')
  const values: Record<string, string> = {
    COVER_NAME: row.fullName.toUpperCase(),
    FULL_NAME: row.fullName.toUpperCase(),
    OFFICE_TITLE: row.officeTitleLines.toUpperCase(),
    DISTRICT_LABEL: row.districtLabel,
    TOWNS: row.townsText,
    WEBSITE: row.websiteDisplay,
    EMAIL: row.email,
    COMMITTEES: row.committeesText,
    INSIDE_HEADER_NAME: `REP. ${row.firstName} ${row.lastName}`.toUpperCase(),
    ACTION_TITLE: `Representative ${row.lastName} in action`,
    SURVEY_URL: row.surveyDisplay,
    FACEBOOK_HANDLE: row.handles.facebook,
    INSTAGRAM_HANDLE: row.handles.instagram,
    YOUTUBE_HANDLE: row.handles.youtube,
    X_HANDLE: row.handles.x,
  }
  return values[key] || ''
}

const contentXml = (value: string) => {
  const lines = value.split(/\n/g)
  return lines
    .map((line, index) => `${index > 0 ? '<Br />' : ''}<Content>${escapeXml(line)}</Content>`)
    .join('')
}

const adjustCharacterStyle = (openTag: string, tagName: string, row: RepExport) => {
  let next = openTag
  const key = tagName.replace(/^P\d+_/, '')
  let pointSize: number | undefined
  if (key === 'TOWNS') {
    const longest = Math.max(...row.towns.map((town) => town.length), 0)
    pointSize = row.towns.length > 6 || longest > 16 ? 21 : row.towns.length > 4 || longest > 12 ? 25 : undefined
  } else if (key === 'COMMITTEES') {
    pointSize = row.committees.length > 4 ? 8.5 : row.committees.length > 2 ? 9.5 : undefined
  } else if (key === 'OFFICE_TITLE' && row.officeTitleLines.includes('\n')) {
    pointSize = 16
  }
  if (pointSize) next = setAttr(next, 'PointSize', String(pointSize))
  return next
}

const replaceStoryText = (xml: string, value: string, tagName: string, row: RepExport) => {
  if (tagName.replace(/^P\d+_/, '') === 'EMAIL') {
    return xml.replace(
      /<Content>Fname\.Lname@housegop\.ct\.gov<\/Content>/g,
      `<Content>${escapeXml(value)}</Content>`,
    )
  }

  const paragraphMatch = xml.match(/<ParagraphStyleRange\b[\s\S]*?<\/ParagraphStyleRange>/)
  if (!paragraphMatch) return xml
  const paragraph = paragraphMatch[0]
  const charMatch = paragraph.match(/<CharacterStyleRange\b[^>]*>[\s\S]*?<\/CharacterStyleRange>/)
  if (!charMatch) return xml
  const charBlock = charMatch[0]
  const charOpen = charBlock.match(/<CharacterStyleRange\b[^>]*>/)?.[0]
  if (!charOpen) return xml
  const properties = charBlock.match(/<Properties>[\s\S]*?<\/Properties>/)?.[0] || ''
  const newChar = `${adjustCharacterStyle(charOpen, tagName, row)}${properties}${contentXml(value)}</CharacterStyleRange>`
  const newParagraph = paragraph.replace(/<CharacterStyleRange\b[\s\S]*<\/CharacterStyleRange>/, newChar)
  return xml.replace(paragraph, newParagraph)
}

const collectTaggedTextFrames = (spreadXml: string) => {
  const frames: { tagName: string; storyID: string }[] = []
  for (const match of spreadXml.matchAll(/<TextFrame\b[^>]*>/g)) {
    const open = match[0]
    const name = attr(open, 'Name')
    if (!name.startsWith('EOSTAG:')) continue
    const storyID = attr(open, 'ParentStory')
    if (!storyID) continue
    frames.push({ tagName: name.replace('EOSTAG:', ''), storyID })
  }
  return frames
}

const replaceTaggedLinks = (spreadXml: string, imageUris: Record<string, string>) =>
  spreadXml.replace(/<Rectangle\b[\s\S]*?<\/Rectangle>/g, (block) => {
    const open = block.match(/<Rectangle\b[^>]*>/)?.[0] || ''
    const name = attr(open, 'Name')
    if (!name.startsWith('EOSTAG:')) return block
    const tagName = name.replace('EOSTAG:', '')
    const key = tagName.replace(/^P\d+_/, '')
    const nextUri = imageUris[key]
    if (!nextUri) return block
    return block.replace(/\bLinkResourceURI="[^"]*"/g, `LinkResourceURI="${nextUri}"`)
  })

const relinkPackagedAssets = (spreadXml: string, relinkUris: Record<string, string>) => {
  let next = spreadXml
  for (const [from, to] of Object.entries(relinkUris)) {
    next = next.replaceAll(`LinkResourceURI="${from}"`, `LinkResourceURI="${to}"`)
  }
  return next
}

const ensureAssets = async (row: RepExport, photosDir: string, options: CliOptions, linkedUris: string[]): Promise<AssetResult> => {
  await fs.mkdir(photosDir, { recursive: true })
  const imageUris: Record<string, string> = {}
  const relinkUris: Record<string, string> = {}
  const copiedAssets: string[] = []
  const missingAssets: string[] = []
  const headshot = row.standardMedia?.mobileHeadshot

  const headshotPath = path.join(photosDir, `headshot${mediaExtension(headshot, '.png')}`)

  for (const filename of await fs.readdir(photosDir).catch(() => [])) {
    if (/^(banner|survey-qr)\./i.test(filename)) {
      await fs.rm(path.join(photosDir, filename), { force: true })
    }
  }

  if (!options.skipDownloads) {
    const headshotUrl = chooseMediaUrl(headshot)
    if (headshotUrl) await downloadFile(headshotUrl, headshotPath)
  }

  imageUris.HEADSHOT = toWindowsFileUri(headshotPath)

  for (const uri of linkedUris) {
    if (/Candelora_Circle/i.test(uri)) continue
    const sourcePath = fileUriToLocalPath(uri)
    if (!sourcePath) continue
    const filename = path.basename(sourcePath)
    if (!filename) continue

    try {
      const stat = await fs.stat(sourcePath)
      if (!stat.isFile()) continue
    } catch {
      missingAssets.push(uri)
      continue
    }

    const destination = path.join(photosDir, filename)
    try {
      await fs.copyFile(sourcePath, destination)
    } catch {
      const uniqueDestination = await uniqueDestinationPath(photosDir, filename)
      await fs.copyFile(sourcePath, uniqueDestination)
      relinkUris[uri] = toWindowsFileUri(uniqueDestination)
      copiedAssets.push(path.basename(uniqueDestination))
      continue
    }
    relinkUris[uri] = toWindowsFileUri(destination)
    copiedAssets.push(filename)
  }

  const uniqueCopiedAssets = [...new Set(copiedAssets)].sort()

  await fs.writeFile(
    path.join(photosDir, 'README.txt'),
    [
      'Drop replacement action photos into this folder.',
      'Automated files:',
      `- headshot${mediaExtension(headshot, '.png')}`,
      ...uniqueCopiedAssets.map((filename) => `- ${filename}`),
      '',
      `Survey URL: ${row.surveyUrl}`,
      'Existing template images are copied here and relinked without changing their artwork.',
      'Headshot is the only image replaced with representative-specific media.',
      missingAssets.length
        ? `Unresolved original links left unchanged: ${missingAssets.length}`
        : 'All existing local template image links were packaged.',
    ].join('\n'),
  )

  return { imageUris, relinkUris, copiedAssets: uniqueCopiedAssets, missingAssets }
}

const exportTenantIdml = async (taggedTemplate: string, row: RepExport, options: CliOptions) => {
  const tenantSlug = row.tenant.slug || slugify(row.fullName)
  const tenantDir = path.join(options.outputRoot, tenantSlug)
  const photosDir = path.join(tenantDir, 'photos')
  await fs.mkdir(tenantDir, { recursive: true })
  const zip = await JSZip.loadAsync(await fs.readFile(taggedTemplate))
  const assetResult = await ensureAssets(row, photosDir, options, await collectLinkedAssetUris(zip))
  const storyReplacements = new Map<string, { value: string; tagName: string }>()

  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('Spreads/') || !name.endsWith('.xml')) continue
    const xml = await zip.file(name)!.async('string')
    const frames = collectTaggedTextFrames(xml)
    for (const frame of frames) {
      const value = textForTag(frame.tagName, row)
      if (value) storyReplacements.set(frame.storyID, { value, tagName: frame.tagName })
    }
    zip.file(name, replaceTaggedLinks(relinkPackagedAssets(xml, assetResult.relinkUris), assetResult.imageUris))
  }

  for (const [storyID, replacement] of storyReplacements) {
    const storyName = `Stories/Story_${storyID}.xml`
    const file = zip.file(storyName)
    if (!file) continue
    const xml = await file.async('string')
    zip.file(storyName, replaceStoryText(xml, replacement.value, replacement.tagName, row))
  }

  const outPath = path.join(tenantDir, `${tenantSlug}.idml`)
  await fs.writeFile(outPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  return outPath
}

const csvValue = (value: unknown) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const writeReviewCsv = async (rows: RepExport[], outputRoot: string) => {
  const header = [
    'tenantSlug',
    'repName',
    'website',
    'surveyUrl',
    'email',
    'facebook',
    'instagram',
    'youtube',
    'x',
    'district',
    'towns',
    'committees',
  ]
  const lines = rows.map((row) =>
    [
      row.tenant.slug,
      row.fullName,
      row.websiteDisplay,
      row.surveyUrl,
      row.email,
      row.handles.facebook,
      row.handles.instagram,
      row.handles.youtube,
      row.handles.x,
      row.districtLabel,
      row.towns.join('; '),
      row.committees.join('; '),
    ]
      .map(csvValue)
      .join(','),
  )
  await fs.mkdir(outputRoot, { recursive: true })
  await fs.writeFile(path.join(outputRoot, 'review.csv'), [header.join(','), ...lines].join('\n'))
}

const main = async () => {
  const options = parseArgs()
  await buildTaggedTemplate(options.templateIdml, options.taggedTemplate)
  const data = await loadDataSet(options)
  const rows = prepareExportRows(data, options)
  if (!rows.length) {
    throw new Error(options.tenant ? `No representative found for tenant ${options.tenant}` : 'No representatives found')
  }

  const outputs: string[] = []
  for (const row of rows) {
    outputs.push(await exportTenantIdml(options.taggedTemplate, row, options))
  }
  await writeReviewCsv(rows, options.outputRoot)

  console.log(`Tagged template: ${options.taggedTemplate}`)
  console.log(`Output root: ${options.outputRoot}`)
  console.log(`Generated ${outputs.length} IDML file(s):`)
  for (const output of outputs) console.log(`- ${output}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
