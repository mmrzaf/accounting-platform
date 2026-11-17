import { canonicalDigits, majorToMinor } from './api'
import { roundHalfEven } from './rounding'
/** Display-only helpers. Server-calculated amounts remain authoritative. */
export function minorToMajor(minor: string, decimals: number): string {
  const amount = BigInt(minor)
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = absolute / base
  const fraction = decimals ? `.${(absolute % base).toString().padStart(decimals, '0')}` : ''
  return `${negative ? '-' : ''}${whole}${fraction}`
}
export function milliToQuantity(milli: string): string {
  const value = BigInt(milli)
  const negative = value < 0n
  const absolute = negative ? -value : value
  const whole = absolute / 1000n
  const decimal = (absolute % 1000n).toString().padStart(3,'0').replace(/0+$/u,'')
  return `${negative ? '-' : ''}${whole}${decimal ? `.${decimal}` : ''}`
}
export function calculatePreview(lines: { quantity:string; unitPrice:string }[], decimals: number): string | null {
  try {
    const total = lines.reduce((sum,line) => {
      const qty = canonicalDigits(line.quantity.trim())
      if (!/^(0|[1-9]\d*)(?:\.\d{1,3})?$/u.test(qty)) throw Error('Invalid quantity')
      const [whole='0', fraction=''] = qty.split('.')
      const milli = BigInt(whole)*1000n + BigInt(fraction.padEnd(3,'0'))
      if (milli <= 0n) throw Error('Invalid quantity')
      const minor = BigInt(majorToMinor(line.unitPrice,decimals))
      if (minor <= 0n) throw Error('Invalid price')
      return sum + roundHalfEven(milli * minor, 1000n)
    }, 0n)
    return total.toString()
  } catch { return null }
}
