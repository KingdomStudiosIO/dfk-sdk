import {
  ABILITY_TIERS,
  APPENDAGE_COLORS,
  BACKGROUNDS,
  CRAFTING_PROFESSIONS,
  ELEMENTS,
  EYE_COLORS,
  GENDERS,
  HAIR_COLORS,
  HERO_CLASSES,
  PROFESSIONS,
  SKIN_COLORS,
  STAT_BOOSTS,
  STAT_GENE_SLOTS,
  VISUAL_GENE_SLOTS,
  type StatGeneSlot,
  type VisualGeneSlot,
} from './constants'

type GeneInput = bigint | string | number | { toString(): string }

/** One trait's four alleles: dominant plus three recessives (r1 is the strongest recessive). */
export interface Alleles<T = number> {
  d: T
  r1: T
  r2: T
  r3: T
}

export type RawGenes<S extends string> = Record<S, Alleles<number>>

const SLOT_COUNT = 12
const DIGITS = SLOT_COUNT * 4

/**
 * Splits a packed gene integer into 12 traits of 4 base-32 digits each.
 * Within a trait the digits are ordered [r3, r2, r1, d].
 */
export function unpackGenes<S extends string>(genes: GeneInput, slots: readonly S[]): RawGenes<S> {
  let value = BigInt(genes.toString())
  if (value < 0n) throw new Error('Genes must be non-negative')
  const digits = new Array<number>(DIGITS)
  for (let i = DIGITS - 1; i >= 0; i--) {
    digits[i] = Number(value % 32n)
    value /= 32n
  }
  const out = {} as RawGenes<S>
  slots.forEach((slot, s) => {
    const [r3, r2, r1, d] = digits.slice(s * 4, s * 4 + 4)
    out[slot] = { d, r1, r2, r3 }
  })
  return out
}

/** Inverse of `unpackGenes`, handy for tests and for generating preview heroes. */
export function packGenes<S extends string>(raw: RawGenes<S>, slots: readonly S[]): bigint {
  let value = 0n
  for (const slot of slots) {
    const { r3, r2, r1, d } = raw[slot]
    for (const digit of [r3, r2, r1, d]) value = value * 32n + BigInt(digit)
  }
  return value
}

/** The 48-character kai string the game uses in its UI and debugging tools. */
export function genesToKai(genes: GeneInput): string {
  const ALPHABET = '123456789abcdefghijkmnopqrstuvwx'
  const raw = unpackGenes(genes, STAT_GENE_SLOTS)
  return STAT_GENE_SLOTS.map(slot => {
    const { r3, r2, r1, d } = raw[slot]
    return [r3, r2, r1, d].map(n => ALPHABET[n]).join('')
  }).join(' ')
}

function label<T extends Record<number, string>>(table: T, a: Alleles): Alleles<T[keyof T] | undefined> {
  return {
    d: table[a.d as keyof T],
    r1: table[a.r1 as keyof T],
    r2: table[a.r2 as keyof T],
    r3: table[a.r3 as keyof T],
  }
}

export interface StatGenes {
  class: Alleles<(typeof HERO_CLASSES)[keyof typeof HERO_CLASSES] | undefined>
  subClass: Alleles<(typeof HERO_CLASSES)[keyof typeof HERO_CLASSES] | undefined>
  profession: Alleles<(typeof PROFESSIONS)[keyof typeof PROFESSIONS] | undefined>
  passive1: Alleles<string | undefined>
  passive2: Alleles<string | undefined>
  active1: Alleles<string | undefined>
  active2: Alleles<string | undefined>
  statBoost1: Alleles<(typeof STAT_BOOSTS)[keyof typeof STAT_BOOSTS] | undefined>
  statBoost2: Alleles<(typeof STAT_BOOSTS)[keyof typeof STAT_BOOSTS] | undefined>
  element: Alleles<(typeof ELEMENTS)[keyof typeof ELEMENTS] | undefined>
  crafting1: Alleles<(typeof CRAFTING_PROFESSIONS)[keyof typeof CRAFTING_PROFESSIONS] | undefined>
  crafting2: Alleles<(typeof CRAFTING_PROFESSIONS)[keyof typeof CRAFTING_PROFESSIONS] | undefined>
  /** Numeric gene ids, for lookups this SDK doesn't label. */
  raw: RawGenes<StatGeneSlot>
}

export function decodeStatGenes(genes: GeneInput): StatGenes {
  const raw = unpackGenes(genes, STAT_GENE_SLOTS)
  return {
    class: label(HERO_CLASSES, raw.class),
    subClass: label(HERO_CLASSES, raw.subClass),
    profession: label(PROFESSIONS, raw.profession),
    passive1: label(ABILITY_TIERS, raw.passive1),
    passive2: label(ABILITY_TIERS, raw.passive2),
    active1: label(ABILITY_TIERS, raw.active1),
    active2: label(ABILITY_TIERS, raw.active2),
    statBoost1: label(STAT_BOOSTS, raw.statBoost1),
    statBoost2: label(STAT_BOOSTS, raw.statBoost2),
    element: label(ELEMENTS, raw.element),
    crafting1: label(CRAFTING_PROFESSIONS, raw.crafting1),
    crafting2: label(CRAFTING_PROFESSIONS, raw.crafting2),
    raw,
  }
}

export interface VisualGenes {
  gender: Alleles<(typeof GENDERS)[keyof typeof GENDERS] | undefined>
  background: Alleles<(typeof BACKGROUNDS)[keyof typeof BACKGROUNDS] | undefined>
  /** Hex colors without `#`. */
  skinColor: Alleles<string | undefined>
  hairColor: Alleles<string | undefined>
  eyeColor: Alleles<string | undefined>
  appendageColor: Alleles<string | undefined>
  backAppendageColor: Alleles<string | undefined>
  /** Style ids; see `MALE_HAIR_STYLES` / `FEMALE_HAIR_STYLES` / `HEAD_APPENDAGES` / `BACK_APPENDAGES` for names. */
  hairStyle: Alleles<number>
  headAppendage: Alleles<number>
  backAppendage: Alleles<number>
  raw: RawGenes<VisualGeneSlot>
}

export function decodeVisualGenes(genes: GeneInput): VisualGenes {
  const raw = unpackGenes(genes, VISUAL_GENE_SLOTS)
  return {
    gender: label(GENDERS, raw.gender),
    background: label(BACKGROUNDS, raw.background),
    skinColor: label(SKIN_COLORS, raw.skinColor),
    hairColor: label(HAIR_COLORS, raw.hairColor),
    eyeColor: label(EYE_COLORS, raw.eyeColor),
    appendageColor: label(APPENDAGE_COLORS, raw.appendageColor),
    backAppendageColor: label(APPENDAGE_COLORS, raw.backAppendageColor),
    hairStyle: raw.hairStyle,
    headAppendage: raw.headAppendage,
    backAppendage: raw.backAppendage,
    raw,
  }
}
