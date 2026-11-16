export const SUPPORTED_LOCALES = ['fa-IR', 'en-US'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export function getDirection(locale: Locale) {
  assertLocale(locale)
  return locale === 'fa-IR' ? 'rtl' : 'ltr'
}

export function assertLocale(locale: unknown): asserts locale is Locale {
  if (!SUPPORTED_LOCALES.some(value => value === locale)) throw new RangeError('Unsupported locale')
}

export function formatInteger(value: bigint, locale: Locale = 'fa-IR'): string {
  assertLocale(locale)
  if (typeof value !== 'bigint') throw new TypeError('Exact integer must be bigint')
  return new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(value)
}

/** Explicit scale, exact arithmetic and currency label. No implicit Rial/Toman exchange. */
export function formatMoney({ minorUnits, scale, currency }: { minorUnits: bigint; scale: number; currency: string }, locale: Locale = 'fa-IR'): string {
  assertLocale(locale)
  if (typeof minorUnits !== 'bigint' || !Number.isInteger(scale) || scale < 0 || scale > 8 || !/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError('Invalid money value')
  }
  const abs = minorUnits < 0n ? -minorUnits : minorUnits
  const unit = 10n ** BigInt(scale)
  const whole = formatInteger(abs / unit, locale)
  const fraction = scale === 0 ? '' : String(abs % unit).padStart(scale, '0')
  const digits = locale === 'fa-IR' ? fraction.replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!) : fraction
  const decimal = locale === 'fa-IR' ? '٫' : '.'
  const sign = minorUnits < 0n ? '−' : ''
  return `${sign}${whole}${scale ? decimal + digits : ''}\u00a0${currency}`
}

/** Dates are persisted as canonical ISO strings. Calendar conversion is presentation-only. */
export function formatDate(isoDate: string, locale: Locale = 'fa-IR', timeZone = 'UTC'): string {
  assertLocale(locale)
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(isoDate)) throw new TypeError('Expected ISO timestamp')
  const value = new Date(isoDate)
  if (Number.isNaN(value.valueOf())) throw new TypeError('Invalid timestamp')
  return new Intl.DateTimeFormat(locale === 'fa-IR' ? 'fa-IR-u-ca-persian' : 'en-US-u-ca-gregory', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(value)
}
