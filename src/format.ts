/** Formats a raw integer amount with `decimals`, trimming trailing zeros. */
export function formatAmount(raw: bigint, decimals: number, { maxFractionDigits }: { maxFractionDigits?: number } = {}): string {
  const negative = raw < 0n
  const abs = negative ? -raw : raw
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  let fraction = decimals > 0 ? (abs % base).toString().padStart(decimals, '0') : ''
  if (maxFractionDigits !== undefined) fraction = fraction.slice(0, maxFractionDigits)
  fraction = fraction.replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** Parses a decimal string into a raw integer amount. */
export function parseAmount(value: string, decimals: number): bigint {
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(value.trim())
  if (!match || (!match[2] && !match[3])) throw new Error(`Invalid amount: "${value}"`)
  const [, sign, whole = '', fraction = ''] = match
  if (fraction.length > decimals) throw new Error(`"${value}" has more than ${decimals} decimals`)
  const raw = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  return sign ? -raw : raw
}
