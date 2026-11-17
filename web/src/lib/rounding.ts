/** Round a nonnegative rational number to an integer using ties-to-even.
 * Matches the ledger's deterministic per-line monetary rounding policy. */
export function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw Error('Invalid rounding operands')
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const twice = remainder * 2n
  return quotient + (twice > denominator || (twice === denominator && quotient % 2n !== 0n) ? 1n : 0n)
}
