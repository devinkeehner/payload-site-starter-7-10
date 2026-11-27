import {
  ArrowRight, BadgeCheck, Banknote, BookOpen, Building2, Bus, CalendarDays, Check, CircleHelp, ClipboardList,
  Clock, Download, FileText, Heart, House, Info, Landmark, Link2, Mail, MapPin, Megaphone, MessageSquare,
  Phone, ShieldCheck, Star, Users, Video, Vote,
} from 'lucide-react'

const icons = {
  check: [Check, 'Check'], info: [Info, 'Information'], star: [Star, 'Star'], arrow: [ArrowRight, 'Arrow right'],
  'badge-check': [BadgeCheck, 'Verified'], banknote: [Banknote, 'Money'], 'book-open': [BookOpen, 'Book'],
  building: [Building2, 'Office building'], bus: [Bus, 'Bus'], calendar: [CalendarDays, 'Calendar'],
  clipboard: [ClipboardList, 'Clipboard'], clock: [Clock, 'Clock'], download: [Download, 'Download'],
  'file-text': [FileText, 'Document'], heart: [Heart, 'Heart'], house: [House, 'Home'], landmark: [Landmark, 'Capitol landmark'],
  link: [Link2, 'Link'], mail: [Mail, 'Mail envelope'], 'map-pin': [MapPin, 'Map pin'], megaphone: [Megaphone, 'Megaphone'],
  message: [MessageSquare, 'Message'], phone: [Phone, 'Phone'], question: [CircleHelp, 'Question'],
  shield: [ShieldCheck, 'Shield'], users: [Users, 'People'], video: [Video, 'Video'], vote: [Vote, 'Vote ballot box'],
} as const

const legacy: Record<string, string> = { check: '✓', info: 'ⓘ', star: '★', arrow: '→' }
export const sectionIconOptions = Object.entries(icons).map(([value, [, label]]) => ({ value, label }))
export const sectionIconSizes = ['16', '20', '24', '32', '40', '48', '64'] as const
export const sectionIconColors = {
  inherit: 'Inherit', '#000042': 'Brand navy', '#A71E22': 'Brand red', '#FF4650': 'Bright red',
  '#334155': 'Slate', '#FFFFFF': 'White', '#F6C64D': 'Gold',
} as const

export function SectionIcon({ symbol, size, color, preview = false }: { symbol?: unknown; size?: unknown; color?: unknown; preview?: boolean }) {
  const name = typeof symbol === 'string' && Object.hasOwn(icons, symbol) ? symbol as keyof typeof icons : 'info'
  const pixels = typeof size === 'string' && sectionIconSizes.some(option => size === option) ? Number(size) : undefined
  const fill = typeof color === 'string' && Object.hasOwn(sectionIconColors, color) ? color : undefined
  const [Icon] = icons[name]
  if (!preview && !pixels && !fill && Object.hasOwn(legacy, name)) return <span aria-hidden="true">{legacy[name]}</span>
  return <Icon aria-hidden="true" focusable="false" size={pixels ?? '1em'} color={fill === 'inherit' ? undefined : fill} />
}
