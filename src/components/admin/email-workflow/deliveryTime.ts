const formatterCache = new Map<string, Intl.DateTimeFormat>()

type DateTimeParts = {
  day: number
  hour: number
  minute: number
  month: number
  year: number
}

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

function getParts(date: Date, timeZone: string): DateTimeParts {
  const values: Partial<DateTimeParts> = {}
  for (const part of getFormatter(timeZone).formatToParts(date)) {
    if (
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'month' ||
      part.type === 'year'
    ) {
      values[part.type] = Number(part.value)
    }
  }

  return {
    day: values.day || 0,
    hour: values.hour === 24 ? 0 : values.hour || 0,
    minute: values.minute || 0,
    month: values.month || 0,
    year: values.year || 0,
  }
}

function parseLocalDateTime(value: string): DateTimeParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null

  const [, year, month, day, hour, minute] = match
  return {
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    month: Number(month),
    year: Number(year),
  }
}

function asUtc(parts: DateTimeParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
}

function matches(left: DateTimeParts, right: DateTimeParts) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  )
}

export function formatDateTimeForZone(
  value: string | null | undefined,
  timeZone: string,
): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = getParts(date, timeZone)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function zonedLocalDateTimeToISO(
  value: string,
  timeZone: string,
): { error: string; iso: null } | { error: null; iso: string } {
  const desired = parseLocalDateTime(value)
  if (!desired) {
    return { error: 'Choose a valid date and time.', iso: null }
  }

  const desiredUtc = asUtc(desired)
  let candidate = desiredUtc

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const rendered = getParts(new Date(candidate), timeZone)
    const difference = desiredUtc - asUtc(rendered)
    if (difference === 0) break
    candidate += difference
  }

  if (!matches(getParts(new Date(candidate), timeZone), desired)) {
    return {
      error: 'That local time does not exist because of daylight saving time. Choose another time.',
      iso: null,
    }
  }

  return { error: null, iso: new Date(candidate).toISOString() }
}
